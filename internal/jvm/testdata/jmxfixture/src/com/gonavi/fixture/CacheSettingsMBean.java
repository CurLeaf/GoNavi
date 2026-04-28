package com.gonavi.fixture;

public interface CacheSettingsMBean {
    String getMode();
    void setMode(String mode);

    String getPassword();
    void setPassword(String password);

    String getApiKey();
    void setApiKey(String apiKey);

    int getHitCount();

    String getLastInvocation();

    String resize(int capacity, boolean enabled);
}
