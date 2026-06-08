package buildutil

import (
	"bytes"
	"debug/pe"
	"encoding/binary"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
)

const peExportDirectoryIndex = 0

type imageExportDirectory struct {
	Characteristics       uint32
	TimeDateStamp         uint32
	MajorVersion          uint16
	MinorVersion          uint16
	Name                  uint32
	Base                  uint32
	NumberOfFunctions     uint32
	NumberOfNames         uint32
	AddressOfFunctions    uint32
	AddressOfNames        uint32
	AddressOfNameOrdinals uint32
}

func GenerateWindowsImportLibraryFromDLL(dllPath string, dlltoolPath string, outputLibPath string) error {
	trimmedDLLPath := strings.TrimSpace(dllPath)
	if trimmedDLLPath == "" {
		return fmt.Errorf("dll path is empty")
	}
	trimmedOutput := strings.TrimSpace(outputLibPath)
	if trimmedOutput == "" {
		return fmt.Errorf("output import library path is empty")
	}
	if strings.TrimSpace(dlltoolPath) == "" {
		resolved, err := exec.LookPath("dlltool")
		if err != nil {
			return fmt.Errorf("locate dlltool failed: %w", err)
		}
		dlltoolPath = resolved
	}

	exportNames, err := readPEExportNames(trimmedDLLPath)
	if err != nil {
		return err
	}
	if len(exportNames) == 0 {
		return fmt.Errorf("no export symbols found in %s", trimmedDLLPath)
	}

	if err := os.MkdirAll(filepath.Dir(trimmedOutput), 0o755); err != nil {
		return fmt.Errorf("create output dir failed: %w", err)
	}

	defPath := strings.TrimSuffix(trimmedOutput, filepath.Ext(trimmedOutput)) + ".def"
	defContent := buildModuleDefinition(filepath.Base(trimmedDLLPath), exportNames)
	if err := os.WriteFile(defPath, []byte(defContent), 0o644); err != nil {
		return fmt.Errorf("write module definition failed: %w", err)
	}

	cmd := exec.Command(
		dlltoolPath,
		"--input-def", defPath,
		"--dllname", filepath.Base(trimmedDLLPath),
		"--output-lib", trimmedOutput,
	)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("generate import library failed: %w; output=%s", err, strings.TrimSpace(string(output)))
	}
	return nil
}

func buildModuleDefinition(dllName string, exportNames []string) string {
	seen := make(map[string]struct{}, len(exportNames))
	normalized := make([]string, 0, len(exportNames))
	for _, name := range exportNames {
		trimmed := strings.TrimSpace(name)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		normalized = append(normalized, trimmed)
	}
	slices.Sort(normalized)

	var builder strings.Builder
	builder.WriteString("LIBRARY ")
	builder.WriteString(dllName)
	builder.WriteString("\nEXPORTS\n")
	for _, name := range normalized {
		builder.WriteString("    ")
		builder.WriteString(name)
		builder.WriteString("\n")
	}
	return builder.String()
}

func readPEExportNames(dllPath string) ([]string, error) {
	file, err := pe.Open(dllPath)
	if err != nil {
		return nil, fmt.Errorf("open dll failed: %w", err)
	}
	defer file.Close()

	exportDirectoryRVA, err := resolveExportDirectoryRVA(file)
	if err != nil {
		return nil, err
	}
	if exportDirectoryRVA == 0 {
		return nil, fmt.Errorf("dll has no export directory: %s", dllPath)
	}

	payload, err := readBytesAtRVA(file, exportDirectoryRVA, binary.Size(imageExportDirectory{}))
	if err != nil {
		return nil, fmt.Errorf("read export directory failed: %w", err)
	}
	var directory imageExportDirectory
	if err := binary.Read(bytes.NewReader(payload), binary.LittleEndian, &directory); err != nil {
		return nil, fmt.Errorf("decode export directory failed: %w", err)
	}
	if directory.NumberOfNames == 0 {
		return nil, nil
	}

	nameTable, err := readBytesAtRVA(file, directory.AddressOfNames, int(directory.NumberOfNames)*4)
	if err != nil {
		return nil, fmt.Errorf("read export name table failed: %w", err)
	}

	names := make([]string, 0, directory.NumberOfNames)
	for index := uint32(0); index < directory.NumberOfNames; index++ {
		offset := index * 4
		nameRVA := binary.LittleEndian.Uint32(nameTable[offset : offset+4])
		name, err := readCStringAtRVA(file, nameRVA)
		if err != nil {
			return nil, fmt.Errorf("read export name failed: %w", err)
		}
		names = append(names, name)
	}
	return names, nil
}

func resolveExportDirectoryRVA(file *pe.File) (uint32, error) {
	switch header := file.OptionalHeader.(type) {
	case *pe.OptionalHeader32:
		if len(header.DataDirectory) <= peExportDirectoryIndex {
			return 0, fmt.Errorf("optional header has no export directory")
		}
		return header.DataDirectory[peExportDirectoryIndex].VirtualAddress, nil
	case *pe.OptionalHeader64:
		if len(header.DataDirectory) <= peExportDirectoryIndex {
			return 0, fmt.Errorf("optional header has no export directory")
		}
		return header.DataDirectory[peExportDirectoryIndex].VirtualAddress, nil
	default:
		return 0, fmt.Errorf("unsupported optional header type %T", file.OptionalHeader)
	}
}

func readBytesAtRVA(file *pe.File, rva uint32, size int) ([]byte, error) {
	if size < 0 {
		return nil, fmt.Errorf("invalid size %d", size)
	}
	for _, section := range file.Sections {
		start := section.VirtualAddress
		length := maxUint32(section.VirtualSize, section.Size)
		end := start + length
		if rva < start || rva >= end {
			continue
		}
		offset := int(rva - start)
		data, err := section.Data()
		if err != nil {
			return nil, err
		}
		if offset > len(data) {
			return nil, fmt.Errorf("rva %d out of section bounds", rva)
		}
		if size == 0 {
			return []byte{}, nil
		}
		if offset+size > len(data) {
			return nil, fmt.Errorf("rva %d with size %d exceeds section size", rva, size)
		}
		return data[offset : offset+size], nil
	}
	return nil, fmt.Errorf("rva %d not found in any section", rva)
}

func readCStringAtRVA(file *pe.File, rva uint32) (string, error) {
	for _, section := range file.Sections {
		start := section.VirtualAddress
		length := maxUint32(section.VirtualSize, section.Size)
		end := start + length
		if rva < start || rva >= end {
			continue
		}
		offset := int(rva - start)
		data, err := section.Data()
		if err != nil {
			return "", err
		}
		if offset >= len(data) {
			return "", fmt.Errorf("string rva %d out of section bounds", rva)
		}
		endIndex := offset
		for endIndex < len(data) && data[endIndex] != 0 {
			endIndex++
		}
		return string(data[offset:endIndex]), nil
	}
	return "", fmt.Errorf("string rva %d not found in any section", rva)
}

func maxUint32(left uint32, right uint32) uint32 {
	if left > right {
		return left
	}
	return right
}
