package com.gonavi.fixture;

public interface CacheSettingsMBean {
    String getMode();
    void setMode(String mode);

    int getHitCount();

    String getLastInvocation();

    String resize(int capacity, boolean enabled);
}
