package com.gonavi.fixture;

public final class CacheSettings implements CacheSettingsMBean {
    private volatile String mode = "warm";
    private final int hitCount = 7;
    private volatile String lastInvocation = "none";

    @Override
    public String getMode() {
        return mode;
    }

    @Override
    public void setMode(String mode) {
        this.mode = mode;
    }

    @Override
    public int getHitCount() {
        return hitCount;
    }

    @Override
    public String getLastInvocation() {
        return lastInvocation;
    }

    @Override
    public String resize(int capacity, boolean enabled) {
        this.lastInvocation = "capacity=" + capacity + ",enabled=" + enabled;
        this.mode = enabled ? "enabled-" + capacity : "disabled-" + capacity;
        return this.lastInvocation;
    }
}
