package main

import (
	"flag"
	"fmt"
	"os"

	"GoNavi-Wails/internal/buildutil"
)

func main() {
	var (
		dllPath     string
		dlltoolPath string
		outputLib   string
	)

	flag.StringVar(&dllPath, "dll", "", "Path to the source DLL")
	flag.StringVar(&dlltoolPath, "dlltool", "", "Optional path to dlltool executable")
	flag.StringVar(&outputLib, "output-lib", "", "Output import library path")
	flag.Parse()

	if err := buildutil.GenerateWindowsImportLibraryFromDLL(dllPath, dlltoolPath, outputLib); err != nil {
		fmt.Fprintf(os.Stderr, "generate mingw import library failed: %v\n", err)
		os.Exit(1)
	}
}
