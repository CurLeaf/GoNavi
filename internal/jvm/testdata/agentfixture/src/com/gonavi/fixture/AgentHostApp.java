package com.gonavi.fixture;

import java.util.concurrent.CountDownLatch;

public final class AgentHostApp {
    private AgentHostApp() {
    }

    public static void main(String[] args) throws Exception {
        new CountDownLatch(1).await();
    }
}
