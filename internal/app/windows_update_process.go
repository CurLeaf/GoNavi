package app

func otherWindowsUpdateProcessIDs(processes []windowsUpdateProcess) []uint32 {
	result := make([]uint32, 0, len(processes))
	for _, process := range processes {
		result = append(result, process.PID)
	}
	return result
}
