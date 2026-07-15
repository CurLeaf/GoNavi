//go:build darwin

package app

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa
#import <Cocoa/Cocoa.h>
#import <dispatch/dispatch.h>

static void gonaviSetApplicationIconFromPNG(const void *data, int length) {
	if (data == NULL || length <= 0) {
		return;
	}
	NSData *pngData = [NSData dataWithBytes:data length:(NSUInteger)length];
	if (pngData == nil) {
		return;
	}
	NSImage *image = [[NSImage alloc] initWithData:pngData];
	if (image == nil) {
		return;
	}
	dispatch_async(dispatch_get_main_queue(), ^{
		[NSApp setApplicationIconImage:image];
		[image release];
	});
}
*/
import "C"

import (
	"unsafe"
)

func setApplicationIconPNG(png []byte) error {
	if len(png) == 0 {
		return nil
	}
	C.gonaviSetApplicationIconFromPNG(unsafe.Pointer(&png[0]), C.int(len(png)))
	return nil
}
