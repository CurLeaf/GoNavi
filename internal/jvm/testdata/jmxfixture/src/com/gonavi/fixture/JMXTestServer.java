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
        ObjectName defaultDomainObjectName = new ObjectName(":type=CacheSettings,name=DefaultDomainCache");
        if (!server.isRegistered(defaultDomainObjectName)) {
            server.registerMBean(new CacheSettings(), defaultDomainObjectName);
        }
        ObjectName whitespaceDomainObjectName = new ObjectName("com.gonavi.fixture :type=CacheSettings,name=WhitespaceDomainCache");
        if (!server.isRegistered(whitespaceDomainObjectName)) {
            server.registerMBean(new CacheSettings(), whitespaceDomainObjectName);
        }

        System.out.println("READY");
        System.out.flush();

        new CountDownLatch(1).await();
    }
}
