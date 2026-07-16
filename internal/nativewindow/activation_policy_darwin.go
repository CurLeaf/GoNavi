//go:build darwin && cgo

package nativewindow

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa

#import <Cocoa/Cocoa.h>
#import <dispatch/dispatch.h>

static void applyDetachedAccessoryActivationPolicy(void *unused) {
    (void)unused;
    NSApplication *application = [NSApplication sharedApplication];
    [application setActivationPolicy:NSApplicationActivationPolicyAccessory];
    [application activateIgnoringOtherApps:YES];
}

static void setDetachedAccessoryActivationPolicy(void) {
    if ([NSThread isMainThread]) {
        applyDetachedAccessoryActivationPolicy(NULL);
        return;
    }
	dispatch_sync_f(dispatch_get_main_queue(), NULL, applyDetachedAccessoryActivationPolicy);
}
*/
import "C"

func setDetachedAccessoryActivationPolicy() {
	C.setDetachedAccessoryActivationPolicy()
}
