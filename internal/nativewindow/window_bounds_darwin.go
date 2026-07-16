//go:build darwin && cgo

package nativewindow

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa

#import <Cocoa/Cocoa.h>
#import <dispatch/dispatch.h>

typedef struct {
    int x;
    int y;
    int width;
    int height;
} DetachedWindowBounds;

static NSWindow *resolveDetachedWindow(void) {
    NSApplication *application = [NSApplication sharedApplication];
    NSWindow *window = [application mainWindow];
    if (window == nil) {
        window = [application keyWindow];
    }
    if (window == nil && [[application windows] count] > 0) {
        window = [[application windows] objectAtIndex:0];
    }
    return window;
}

static void applyDetachedWindowBounds(void *rawBounds) {
    DetachedWindowBounds *bounds = (DetachedWindowBounds *)rawBounds;
    NSWindow *window = resolveDetachedWindow();
    NSArray<NSScreen *> *screens = [NSScreen screens];
    if (window == nil || [screens count] == 0) {
        return;
    }

    // Browser screenX/screenY use the primary display's top-left as the global
    // origin. Cocoa uses the primary display's bottom-left, so only Y needs to
    // be flipped around the primary screen's top edge.
    NSRect primaryFrame = [[screens objectAtIndex:0] frame];
    NSRect frame = [window frame];
    frame.origin.x = (CGFloat)bounds->x;
    frame.origin.y = NSMaxY(primaryFrame) - (CGFloat)bounds->y - (CGFloat)bounds->height;
    frame.size.width = (CGFloat)bounds->width;
    frame.size.height = (CGFloat)bounds->height;
    [window setFrame:frame display:NO animate:NO];
}

static void setDetachedWindowBounds(int x, int y, int width, int height) {
    DetachedWindowBounds bounds = { x, y, width, height };
    if ([NSThread isMainThread]) {
        applyDetachedWindowBounds(&bounds);
        return;
    }
    dispatch_sync_f(dispatch_get_main_queue(), &bounds, applyDetachedWindowBounds);
}
*/
import "C"

import "context"

func applyDetachedWindowBounds(_ context.Context, x, y, width, height int) {
	C.setDetachedWindowBounds(C.int(x), C.int(y), C.int(width), C.int(height))
}
