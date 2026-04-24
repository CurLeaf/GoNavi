package com.gonavi.fixture;

import java.lang.management.ManagementFactory;
import java.util.concurrent.CountDownLatch;
import javax.management.MBeanServer;
import javax.management.ObjectName;

public final class JMXTestServer {
    private JMXTestServer() {
    }

    public static void main(String[] args) throws Exception {
        MBeanServer server = ManagementFactory.getPlatformMBeanServer();
        ObjectName objectName = new ObjectName("com.gonavi.fixture:type=CacheSettings,name=PrimaryCache");
        if (!server.isRegistered(objectName)) {
            server.registerMBean(new CacheSettings(), objectName);
        }

        System.out.println("READY");
        System.out.flush();

        new CountDownLatch(1).await();
    }
}
