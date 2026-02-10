//go:build !darwin

package app

func applyMacWindowTranslucencyFix() {}

func setMacWindowTranslucency(opacity float64, blur float64) {}
