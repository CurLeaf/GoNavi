package com.gonavi.jmxhelper;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import javax.management.Attribute;
import javax.management.AttributeNotFoundException;
import javax.management.MBeanAttributeInfo;
import javax.management.MBeanInfo;
import javax.management.MBeanOperationInfo;
import javax.management.MBeanParameterInfo;
import javax.management.MBeanServerConnection;
import javax.management.ObjectName;
import javax.management.openmbean.CompositeData;
import javax.management.openmbean.TabularData;
import javax.management.remote.JMXConnector;
import javax.management.remote.JMXConnectorFactory;
import javax.management.remote.JMXServiceURL;

final class JmxRuntime {
    private JmxRuntime() {
    }

    static Map<String, Object> handle(Map<String, Object> request) throws Exception {
        String command = requiredString(request.get("command"), "command");
        ConnectionSpec connection = ConnectionSpec.from(requiredObject(request.get("connection"), "connection"));
        TargetSpec target = TargetSpec.from(optionalObject(request.get("target")));
        Map<String, Object> change = optionalObject(request.get("change"));

        try (JMXConnector connector = connect(connection)) {
            MBeanServerConnection server = connector.getMBeanServerConnection();
            switch (command) {
                case "ping":
                    server.getDefaultDomain();
                    return new LinkedHashMap<>();
                case "list":
                    return listResources(server, connection, target);
                case "get":
                    return singleton("snapshot", getValue(server, target));
                case "preview":
                    return singleton("preview", previewChange(server, target, change));
                case "apply":
                    return singleton("applyResult", applyChange(server, target, change));
                default:
                    throw new IllegalArgumentException("unsupported helper command: " + command);
            }
        } catch (Exception error) {
            throw new IllegalStateException(
                "JMX command " + command + " failed for " + connection.describe() + ": " + error.getMessage(),
                error
            );
        }
    }

    private static JMXConnector connect(ConnectionSpec connection) throws Exception {
        String serviceUrl = "service:jmx:rmi:///jndi/rmi://" + connection.host + ":" + connection.port + "/jmxrmi";
        JMXServiceURL url = new JMXServiceURL(serviceUrl);
        Map<String, Object> environment = new LinkedHashMap<>();
        if (!connection.username.isEmpty()) {
            environment.put(JMXConnector.CREDENTIALS, new String[]{connection.username, connection.password});
        }
        return JMXConnectorFactory.connect(url, environment);
    }

    private static Map<String, Object> listResources(
        MBeanServerConnection server,
        ConnectionSpec connection,
        TargetSpec target
    ) throws Exception {
        List<Map<String, Object>> resources = new ArrayList<>();

        if (target == null || target.isRoot()) {
            String[] domains = server.getDomains();
            Arrays.sort(domains);
            for (String domain : domains) {
                if (!connection.isDomainAllowed(domain)) {
                    continue;
                }
                resources.add(resource("domain", domain, null, null, null, null, domain, true, false, true, false));
            }
            return singleton("resources", resources);
        }

        if (target.isDomain()) {
            Set<ObjectName> names = server.queryNames(new ObjectName(target.domain + ":*"), null);
            List<ObjectName> sortedNames = new ArrayList<>(names);
            Collections.sort(sortedNames, Comparator.comparing(ObjectName::getCanonicalName));
            for (ObjectName name : sortedNames) {
                resources.add(resource(
                    "mbean",
                    target.domain,
                    name.getCanonicalName(),
                    null,
                    null,
                    null,
                    name.toString(),
                    true,
                    false,
                    true,
                    false
                ));
            }
            return singleton("resources", resources);
        }

        if (target.isMBean()) {
            ObjectName objectName = new ObjectName(target.objectName);
            MBeanInfo info = server.getMBeanInfo(objectName);

            MBeanAttributeInfo[] attributes = info.getAttributes();
            Arrays.sort(attributes, Comparator.comparing(MBeanAttributeInfo::getName));
            for (MBeanAttributeInfo attribute : attributes) {
                if (!attribute.isReadable() && !attribute.isWritable()) {
                    continue;
                }
                resources.add(resource(
                    "attribute",
                    domainOf(objectName),
                    objectName.getCanonicalName(),
                    attribute.getName(),
                    null,
                    null,
                    attribute.getName(),
                    attribute.isReadable(),
                    attribute.isWritable(),
                    false,
                    isSensitiveName(attribute.getName())
                ));
            }

            MBeanOperationInfo[] operations = info.getOperations();
            Arrays.sort(operations, Comparator.comparing(JmxRuntime::displayOperationName));
            for (MBeanOperationInfo operation : operations) {
                List<String> signature = signatureOf(operation);
                resources.add(resource(
                    "operation",
                    domainOf(objectName),
                    objectName.getCanonicalName(),
                    null,
                    operation.getName(),
                    signature,
                    displayOperationName(operation),
                    true,
                    true,
                    false,
                    false
                ));
            }
            return singleton("resources", resources);
        }

        throw new IllegalArgumentException("target kind " + target.kind + " does not support list");
    }

    private static Map<String, Object> getValue(MBeanServerConnection server, TargetSpec target) throws Exception {
        requireTarget(target);

        if (target.isDomain()) {
            Set<ObjectName> names = server.queryNames(new ObjectName(target.domain + ":*"), null);
            Map<String, Object> value = new LinkedHashMap<>();
            value.put("domain", target.domain);
            value.put("mbeanCount", names.size());
            return snapshot("domain", "json", value, "JMX 域 " + target.domain, false, Collections.emptyList(), metadata("domain", target.domain));
        }

        ObjectName objectName = new ObjectName(target.objectName);
        if (target.isMBean()) {
            MBeanInfo info = server.getMBeanInfo(objectName);
            List<Map<String, Object>> attributes = new ArrayList<>();
            for (MBeanAttributeInfo attribute : info.getAttributes()) {
                attributes.add(attributeInfoValue(attribute));
            }
            List<Map<String, Object>> operations = new ArrayList<>();
            for (MBeanOperationInfo operation : info.getOperations()) {
                operations.add(operationInfoValue(operation));
            }

            Map<String, Object> value = new LinkedHashMap<>();
            value.put("objectName", objectName.toString());
            value.put("className", info.getClassName());
            value.put("description", info.getDescription());
            value.put("attributes", attributes);
            value.put("operations", operations);
            return snapshot("mbean", "json", value, info.getDescription(), false, Collections.emptyList(), metadata(
                "objectName", objectName.toString(),
                "className", info.getClassName()
            ));
        }

        if (target.isAttribute()) {
            MBeanAttributeInfo attributeInfo = requireAttributeInfo(server, objectName, target.attribute);
            Object value = server.getAttribute(objectName, target.attribute);
            return attributeSnapshot(objectName, attributeInfo, value);
        }

        if (target.isOperation()) {
            MBeanOperationInfo operationInfo = requireOperationInfo(server, objectName, target.operation, target.signature);
            return operationSnapshot(objectName, operationInfo);
        }

        throw new IllegalArgumentException("unsupported target kind: " + target.kind);
    }

    private static Map<String, Object> previewChange(
        MBeanServerConnection server,
        TargetSpec target,
        Map<String, Object> change
    ) throws Exception {
        requireTarget(target);
        Map<String, Object> payload = optionalObject(change == null ? null : change.get("payload"));

        if (target.isAttribute()) {
            ObjectName objectName = new ObjectName(target.objectName);
            MBeanAttributeInfo attributeInfo = requireAttributeInfo(server, objectName, target.attribute);
            Map<String, Object> before = attributeSnapshot(objectName, attributeInfo, server.getAttribute(objectName, target.attribute));
            if (!attributeInfo.isWritable()) {
                return preview(false, false,
                    "attribute " + target.attribute + " is not writable",
                    "high",
                    "attribute " + target.attribute + " is not writable",
                    before,
                    null
                );
            }
            if (payload == null || !payload.containsKey("value")) {
                throw new IllegalArgumentException("attribute preview payload.value is required");
            }
            Object next = convertValue(payload.get("value"), attributeInfo.getType());
            return preview(true, false,
                "set " + target.attribute + " on " + objectName.getCanonicalName(),
                "medium",
                null,
                before,
                attributeSnapshot(objectName, attributeInfo, next)
            );
        }

        if (target.isOperation()) {
            ObjectName objectName = new ObjectName(target.objectName);
            MBeanOperationInfo operationInfo = requireOperationInfo(server, objectName, target.operation, target.signature);
            List<Object> args = argumentList(payload);
            String[] signature = effectiveSignature(target, payload, operationInfo);
            convertArguments(args, signature);

            Map<String, Object> afterValue = new LinkedHashMap<>();
            afterValue.put("plannedArgs", toJsonCompatible(args));
            afterValue.put("signature", Arrays.asList(signature));
            afterValue.put("returnType", operationInfo.getReturnType());
            afterValue.put("description", "preview does not execute the target operation");

            return preview(true, true,
                "invoke " + displayOperationName(operationInfo) + " on " + objectName.getCanonicalName(),
                "high",
                null,
                operationSnapshot(objectName, operationInfo),
                snapshot("operation", "json", afterValue, metadata(
                    "objectName", objectName.getCanonicalName(),
                    "operation", operationInfo.getName(),
                    "signature", Arrays.asList(signature)
                ))
            );
        }

        throw new IllegalArgumentException("preview only supports attribute or operation targets");
    }

    private static Map<String, Object> applyChange(
        MBeanServerConnection server,
        TargetSpec target,
        Map<String, Object> change
    ) throws Exception {
        requireTarget(target);
        Map<String, Object> payload = optionalObject(change == null ? null : change.get("payload"));

        if (target.isAttribute()) {
            ObjectName objectName = new ObjectName(target.objectName);
            MBeanAttributeInfo attributeInfo = requireAttributeInfo(server, objectName, target.attribute);
            if (!attributeInfo.isWritable()) {
                throw new IllegalArgumentException("attribute " + target.attribute + " is not writable");
            }
            if (payload == null || !payload.containsKey("value")) {
                throw new IllegalArgumentException("attribute apply payload.value is required");
            }
            Object next = convertValue(payload.get("value"), attributeInfo.getType());
            server.setAttribute(objectName, new Attribute(target.attribute, next));
            return metadata(
                "status", "applied",
                "message", "attribute " + target.attribute + " updated",
                "updatedValue", attributeSnapshot(objectName, attributeInfo, server.getAttribute(objectName, target.attribute))
            );
        }

        if (target.isOperation()) {
            ObjectName objectName = new ObjectName(target.objectName);
            MBeanOperationInfo operationInfo = requireOperationInfo(server, objectName, target.operation, target.signature);
            List<Object> args = argumentList(payload);
            String[] signature = effectiveSignature(target, payload, operationInfo);
            Object[] convertedArgs = convertArguments(args, signature);
            Object resultValue = server.invoke(objectName, operationInfo.getName(), convertedArgs, signature);

            Map<String, Object> updatedValue = snapshot("operation", "json", metadata(
                "returnValue", toJsonCompatible(resultValue),
                "args", toJsonCompatible(args),
                "signature", Arrays.asList(signature)
            ), metadata(
                "objectName", objectName.getCanonicalName(),
                "operation", operationInfo.getName(),
                "signature", Arrays.asList(signature)
            ));
            return metadata(
                "status", "applied",
                "message", "operation " + displayOperationName(operationInfo) + " invoked",
                "updatedValue", updatedValue
            );
        }

        throw new IllegalArgumentException("apply only supports attribute or operation targets");
    }

    private static MBeanAttributeInfo requireAttributeInfo(
        MBeanServerConnection server,
        ObjectName objectName,
        String attribute
    ) throws Exception {
        MBeanInfo info = server.getMBeanInfo(objectName);
        for (MBeanAttributeInfo item : info.getAttributes()) {
            if (item.getName().equals(attribute)) {
                return item;
            }
        }
        throw new AttributeNotFoundException("attribute " + attribute + " not found on " + objectName.getCanonicalName());
    }

    private static MBeanOperationInfo requireOperationInfo(
        MBeanServerConnection server,
        ObjectName objectName,
        String operation,
        List<String> signature
    ) throws Exception {
        MBeanInfo info = server.getMBeanInfo(objectName);
        List<MBeanOperationInfo> matches = new ArrayList<>();
        for (MBeanOperationInfo item : info.getOperations()) {
            if (item.getName().equals(operation)) {
                matches.add(item);
            }
        }
        if (matches.isEmpty()) {
            throw new IllegalArgumentException("operation " + operation + " not found on " + objectName.getCanonicalName());
        }
        if (signature != null && !signature.isEmpty()) {
            for (MBeanOperationInfo item : matches) {
                if (signatureOf(item).equals(signature)) {
                    return item;
                }
            }
            throw new IllegalArgumentException(
                "operation " + operation + " with signature " + String.join(",", signature) +
                " not found on " + objectName.getCanonicalName()
            );
        }
        if (matches.size() > 1) {
            throw new IllegalArgumentException("operation " + operation + " is overloaded, signature is required");
        }
        return matches.get(0);
    }

    private static Map<String, Object> attributeSnapshot(
        ObjectName objectName,
        MBeanAttributeInfo attributeInfo,
        Object value
    ) {
        Object jsonValue = toJsonCompatible(value);
        List<Map<String, Object>> supportedActions = attributeInfo.isWritable()
            ? Collections.singletonList(actionDefinition(
                "set",
                "设置属性",
                "更新 JMX 属性 " + attributeInfo.getName(),
                isSensitiveName(attributeInfo.getName()),
                Collections.singletonList(payloadField("value", attributeInfo.getType(), true, "目标属性值")),
                metadata("value", jsonValue)
            ))
            : Collections.emptyList();
        return snapshot("attribute", inferFormat(jsonValue), jsonValue, attributeInfo.getDescription(), isSensitiveName(attributeInfo.getName()), supportedActions, metadata(
            "objectName", objectName.toString(),
            "attribute", attributeInfo.getName(),
            "type", attributeInfo.getType(),
            "readable", attributeInfo.isReadable(),
            "writable", attributeInfo.isWritable(),
            "description", attributeInfo.getDescription()
        ));
    }

    private static Map<String, Object> operationSnapshot(ObjectName objectName, MBeanOperationInfo operationInfo) {
        List<String> signature = signatureOf(operationInfo);
        List<Map<String, Object>> supportedActions = Collections.singletonList(actionDefinition(
            "invoke",
            "调用操作",
            "执行 JMX 操作 " + displayOperationName(operationInfo),
            operationInfo.getImpact() != MBeanOperationInfo.INFO,
            Arrays.asList(
                payloadField("args", "array", false, "按签名顺序传入参数值"),
                payloadField("signature", "array", false, "可选，显式指定方法签名")
            ),
            metadata("args", defaultArguments(signature), "signature", signature)
        ));
        return snapshot("operation", "json", metadata(
            "returnType", operationInfo.getReturnType(),
            "impact", impactLabel(operationInfo.getImpact()),
            "signature", signature,
            "description", operationInfo.getDescription()
        ), operationInfo.getDescription(), false, supportedActions, metadata(
            "objectName", objectName.toString(),
            "operation", operationInfo.getName(),
            "signature", signature
        ));
    }

    private static List<Object> argumentList(Map<String, Object> payload) {
        if (payload == null) {
            return Collections.emptyList();
        }
        if (payload.containsKey("args")) {
            return requiredArray(payload.get("args"), "payload.args");
        }
        if (payload.containsKey("arguments")) {
            return requiredArray(payload.get("arguments"), "payload.arguments");
        }
        return Collections.emptyList();
    }

    private static String[] effectiveSignature(
        TargetSpec target,
        Map<String, Object> payload,
        MBeanOperationInfo operationInfo
    ) {
        if (target.signature != null && !target.signature.isEmpty()) {
            return target.signature.toArray(new String[0]);
        }
        if (payload != null && payload.containsKey("signature")) {
            List<Object> raw = requiredArray(payload.get("signature"), "payload.signature");
            String[] signature = new String[raw.size()];
            for (int index = 0; index < raw.size(); index++) {
                signature[index] = requiredString(raw.get(index), "payload.signature[" + index + "]");
            }
            return signature;
        }
        return signatureOf(operationInfo).toArray(new String[0]);
    }

    private static Object[] convertArguments(List<Object> args, String[] signature) throws Exception {
        if (args.size() != signature.length) {
            throw new IllegalArgumentException(
                "operation arguments do not match signature length: got " + args.size() + ", expected " + signature.length
            );
        }
        Object[] converted = new Object[signature.length];
        for (int index = 0; index < signature.length; index++) {
            converted[index] = convertValue(args.get(index), signature[index]);
        }
        return converted;
    }

    private static Object convertValue(Object raw, String targetType) throws Exception {
        String normalized = targetType == null ? "" : targetType.trim();
        switch (normalized) {
            case "java.lang.String":
            case "String":
                return raw == null ? null : String.valueOf(raw);
            case "boolean":
            case "java.lang.Boolean":
                return toBoolean(raw);
            case "int":
            case "java.lang.Integer":
                return toNumber(raw).intValue();
            case "long":
            case "java.lang.Long":
                return toNumber(raw).longValue();
            case "double":
            case "java.lang.Double":
                return toNumber(raw).doubleValue();
            case "float":
            case "java.lang.Float":
                return toNumber(raw).floatValue();
            case "short":
            case "java.lang.Short":
                return toNumber(raw).shortValue();
            case "byte":
            case "java.lang.Byte":
                return toNumber(raw).byteValue();
            case "javax.management.ObjectName":
                return new ObjectName(requiredString(raw, "objectName value"));
            default:
                if (normalized.endsWith("[]")) {
                    return convertArrayValue(raw, normalized.substring(0, normalized.length() - 2));
                }
                if (raw == null) {
                    return null;
                }
                if (normalized.isEmpty() || "java.lang.Object".equals(normalized) || "Object".equals(normalized)) {
                    return raw;
                }
                throw new IllegalArgumentException("unsupported JMX argument type: " + normalized);
        }
    }

    private static Object convertArrayValue(Object raw, String elementType) throws Exception {
        List<Object> items = requiredArray(raw, "array value");
        switch (elementType) {
            case "java.lang.String":
            case "String": {
                String[] result = new String[items.size()];
                for (int index = 0; index < items.size(); index++) {
                    result[index] = requiredString(items.get(index), "array[" + index + "]");
                }
                return result;
            }
            case "int": {
                int[] result = new int[items.size()];
                for (int index = 0; index < items.size(); index++) {
                    result[index] = toNumber(items.get(index)).intValue();
                }
                return result;
            }
            case "long": {
                long[] result = new long[items.size()];
                for (int index = 0; index < items.size(); index++) {
                    result[index] = toNumber(items.get(index)).longValue();
                }
                return result;
            }
            case "boolean": {
                boolean[] result = new boolean[items.size()];
                for (int index = 0; index < items.size(); index++) {
                    result[index] = toBoolean(items.get(index));
                }
                return result;
            }
            default:
                throw new IllegalArgumentException("unsupported JMX array type: " + elementType + "[]");
        }
    }

    private static boolean toBoolean(Object raw) {
        if (raw instanceof Boolean) {
            return (Boolean) raw;
        }
        if (raw instanceof Number) {
            return ((Number) raw).intValue() != 0;
        }
        String text = requiredString(raw, "boolean value").trim().toLowerCase(Locale.ROOT);
        if ("true".equals(text) || "1".equals(text)) {
            return true;
        }
        if ("false".equals(text) || "0".equals(text)) {
            return false;
        }
        throw new IllegalArgumentException("invalid boolean value: " + raw);
    }

    private static Number toNumber(Object raw) {
        if (raw instanceof Number) {
            return (Number) raw;
        }
        String text = requiredString(raw, "numeric value").trim();
        if (text.contains(".") || text.contains("e") || text.contains("E")) {
            return Double.valueOf(text);
        }
        return Long.valueOf(text);
    }

    private static Object toJsonCompatible(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof String || value instanceof Number || value instanceof Boolean) {
            return value;
        }
        if (value instanceof Character) {
            return String.valueOf(value);
        }
        if (value instanceof Enum<?>) {
            return ((Enum<?>) value).name();
        }
        if (value instanceof ObjectName) {
            return ((ObjectName) value).getCanonicalName();
        }
        if (value instanceof Date) {
            return ((Date) value).toInstant().toString();
        }
        if (value instanceof CompositeData) {
            CompositeData composite = (CompositeData) value;
            TreeMap<String, Object> result = new TreeMap<>();
            for (String key : composite.getCompositeType().keySet()) {
                result.put(key, toJsonCompatible(composite.get(key)));
            }
            return result;
        }
        if (value instanceof TabularData) {
            TabularData table = (TabularData) value;
            List<Object> result = new ArrayList<>();
            for (Object entry : table.values()) {
                result.add(toJsonCompatible(entry));
            }
            return result;
        }
        if (value instanceof Map<?, ?>) {
            TreeMap<String, Object> result = new TreeMap<>();
            for (Map.Entry<?, ?> entry : ((Map<?, ?>) value).entrySet()) {
                result.put(String.valueOf(entry.getKey()), toJsonCompatible(entry.getValue()));
            }
            return result;
        }
        if (value instanceof Collection<?>) {
            List<Object> result = new ArrayList<>();
            for (Object item : (Collection<?>) value) {
                result.add(toJsonCompatible(item));
            }
            return result;
        }
        if (value.getClass().isArray()) {
            int length = java.lang.reflect.Array.getLength(value);
            List<Object> result = new ArrayList<>(length);
            for (int index = 0; index < length; index++) {
                result.add(toJsonCompatible(java.lang.reflect.Array.get(value, index)));
            }
            return result;
        }
        return String.valueOf(value);
    }

    private static String inferFormat(Object value) {
        if (value == null) {
            return "null";
        }
        if (value instanceof String) {
            return "string";
        }
        if (value instanceof Number) {
            return "number";
        }
        if (value instanceof Boolean) {
            return "boolean";
        }
        if (value instanceof List<?>) {
            return "array";
        }
        return "json";
    }

    private static List<String> signatureOf(MBeanOperationInfo operation) {
        List<String> signature = new ArrayList<>();
        for (MBeanParameterInfo parameter : operation.getSignature()) {
            signature.add(parameter.getType());
        }
        return signature;
    }

    private static String displayOperationName(MBeanOperationInfo operation) {
        return operation.getName() + "(" + String.join(",", signatureOf(operation)) + ")";
    }

    private static String impactLabel(int impact) {
        switch (impact) {
            case MBeanOperationInfo.INFO:
                return "INFO";
            case MBeanOperationInfo.ACTION:
                return "ACTION";
            case MBeanOperationInfo.ACTION_INFO:
                return "ACTION_INFO";
            case MBeanOperationInfo.UNKNOWN:
            default:
                return "UNKNOWN";
        }
    }

    private static boolean isSensitiveName(String name) {
        String lowered = name == null ? "" : name.trim().toLowerCase(Locale.ROOT);
        return lowered.contains("password")
            || lowered.contains("secret")
            || lowered.contains("token")
            || lowered.contains("credential");
    }

    private static String domainOf(ObjectName objectName) {
        return objectName.getDomain();
    }

    private static void requireTarget(TargetSpec target) {
        if (target == null || target.isRoot()) {
            throw new IllegalArgumentException("change target is required");
        }
    }

    private static Map<String, Object> preview(
        boolean allowed,
        boolean requiresConfirmation,
        String summary,
        String riskLevel,
        String blockingReason,
        Map<String, Object> before,
        Map<String, Object> after
    ) {
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("allowed", allowed);
        if (requiresConfirmation) {
            result.put("requiresConfirmation", true);
        }
        result.put("summary", summary);
        result.put("riskLevel", riskLevel);
        if (blockingReason != null && !blockingReason.isEmpty()) {
            result.put("blockingReason", blockingReason);
        }
        if (before != null) {
            result.put("before", before);
        }
        if (after != null) {
            result.put("after", after);
        }
        return result;
    }

    private static Map<String, Object> snapshot(String kind, String format, Object value, Map<String, Object> metadata) {
        return snapshot(kind, format, value, "", false, Collections.emptyList(), metadata);
    }

    private static Map<String, Object> snapshot(
        String kind,
        String format,
        Object value,
        String description,
        boolean sensitive,
        List<Map<String, Object>> supportedActions,
        Map<String, Object> metadata
    ) {
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("kind", kind);
        result.put("format", format);
        result.put("value", value);
        if (description != null && !description.isEmpty()) {
            result.put("description", description);
        }
        if (sensitive) {
            result.put("sensitive", true);
        }
        if (supportedActions != null && !supportedActions.isEmpty()) {
            result.put("supportedActions", supportedActions);
        }
        if (metadata != null && !metadata.isEmpty()) {
            result.put("metadata", metadata);
        }
        return result;
    }

    private static Map<String, Object> actionDefinition(
        String action,
        String label,
        String description,
        boolean dangerous,
        List<Map<String, Object>> payloadFields,
        Map<String, Object> payloadExample
    ) {
        return metadata(
            "action", action,
            "label", label,
            "description", description,
            "dangerous", dangerous,
            "payloadFields", payloadFields,
            "payloadExample", payloadExample
        );
    }

    private static Map<String, Object> payloadField(String name, String type, boolean required, String description) {
        return metadata("name", name, "type", type, "required", required, "description", description);
    }

    private static List<Object> defaultArguments(List<String> signature) {
        List<Object> values = new ArrayList<>();
        for (String type : signature) {
            switch (type) {
                case "boolean":
                case "java.lang.Boolean":
                    values.add(Boolean.FALSE);
                    break;
                case "int":
                case "java.lang.Integer":
                case "long":
                case "java.lang.Long":
                case "double":
                case "java.lang.Double":
                case "float":
                case "java.lang.Float":
                case "short":
                case "java.lang.Short":
                case "byte":
                case "java.lang.Byte":
                    values.add(0);
                    break;
                default:
                    values.add("");
                    break;
            }
        }
        return values;
    }

    private static Map<String, Object> resource(
        String kind,
        String domain,
        String objectName,
        String attribute,
        String operation,
        List<String> signature,
        String name,
        boolean canRead,
        boolean canWrite,
        boolean hasChildren,
        boolean sensitive
    ) {
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("kind", kind);
        if (domain != null && !domain.isEmpty()) {
            result.put("domain", domain);
        }
        if (objectName != null && !objectName.isEmpty()) {
            result.put("objectName", objectName);
        }
        if (attribute != null && !attribute.isEmpty()) {
            result.put("attribute", attribute);
        }
        if (operation != null && !operation.isEmpty()) {
            result.put("operation", operation);
        }
        if (signature != null && !signature.isEmpty()) {
            result.put("signature", signature);
        }
        result.put("name", name);
        result.put("canRead", canRead);
        result.put("canWrite", canWrite);
        result.put("hasChildren", hasChildren);
        if (sensitive) {
            result.put("sensitive", true);
        }
        return result;
    }

    private static Map<String, Object> singleton(String key, Object value) {
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put(key, value);
        return result;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> requiredObject(Object value, String label) {
        if (value instanceof Map<?, ?>) {
            return (Map<String, Object>) value;
        }
        throw new IllegalArgumentException(label + " must be a JSON object");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> optionalObject(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Map<?, ?>) {
            return (Map<String, Object>) value;
        }
        throw new IllegalArgumentException("expected JSON object");
    }

    @SuppressWarnings("unchecked")
    private static List<Object> requiredArray(Object value, String label) {
        if (value instanceof List<?>) {
            return (List<Object>) value;
        }
        throw new IllegalArgumentException(label + " must be a JSON array");
    }

    private static String requiredString(Object value, String label) {
        if (value == null) {
            throw new IllegalArgumentException(label + " is required");
        }
        String text = String.valueOf(value).trim();
        if (text.isEmpty()) {
            throw new IllegalArgumentException(label + " is required");
        }
        return text;
    }

    private static int integerValue(Object value, String label) {
        if (value instanceof Number) {
            return ((Number) value).intValue();
        }
        String text = requiredString(value, label);
        if (text.endsWith(".0")) {
            text = text.substring(0, text.length() - 2);
        }
        return Integer.parseInt(text);
    }

    private static Map<String, Object> metadata(Object... pairs) {
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        for (int index = 0; index + 1 < pairs.length; index += 2) {
            if (pairs[index + 1] == null) {
                continue;
            }
            result.put(String.valueOf(pairs[index]), pairs[index + 1]);
        }
        return result;
    }

    private static Map<String, Object> attributeInfoValue(MBeanAttributeInfo attribute) {
        return metadata(
            "name", attribute.getName(),
            "type", attribute.getType(),
            "description", attribute.getDescription(),
            "readable", attribute.isReadable(),
            "writable", attribute.isWritable()
        );
    }

    private static Map<String, Object> operationInfoValue(MBeanOperationInfo operation) {
        return metadata(
            "name", operation.getName(),
            "displayName", displayOperationName(operation),
            "returnType", operation.getReturnType(),
            "impact", impactLabel(operation.getImpact()),
            "signature", signatureOf(operation)
        );
    }

    private static final class ConnectionSpec {
        private final String host;
        private final int port;
        private final String username;
        private final String password;
        private final List<String> domainAllowlist;

        private ConnectionSpec(
            String host,
            int port,
            String username,
            String password,
            List<String> domainAllowlist
        ) {
            this.host = host;
            this.port = port;
            this.username = username;
            this.password = password;
            this.domainAllowlist = domainAllowlist;
        }

        private static ConnectionSpec from(Map<String, Object> source) {
            String host = requiredString(source.get("host"), "connection.host");
            int port = integerValue(source.get("port"), "connection.port");
            String username = source.get("username") == null ? "" : String.valueOf(source.get("username")).trim();
            String password = source.get("password") == null ? "" : String.valueOf(source.get("password"));
            List<String> allowlist = new ArrayList<>();
            if (source.get("domainAllowlist") instanceof List<?>) {
                for (Object item : requiredArray(source.get("domainAllowlist"), "connection.domainAllowlist")) {
                    String domain = String.valueOf(item).trim();
                    if (!domain.isEmpty()) {
                        allowlist.add(domain);
                    }
                }
            }
            return new ConnectionSpec(host, port, username, password, allowlist);
        }

        private boolean isDomainAllowed(String domain) {
            return domainAllowlist.isEmpty() || domainAllowlist.contains(domain);
        }

        private String describe() {
            return host + ":" + port;
        }
    }

    private static final class TargetSpec {
        private final String kind;
        private final String domain;
        private final String objectName;
        private final String attribute;
        private final String operation;
        private final List<String> signature;

        private TargetSpec(
            String kind,
            String domain,
            String objectName,
            String attribute,
            String operation,
            List<String> signature
        ) {
            this.kind = kind == null ? "root" : kind;
            this.domain = domain == null ? "" : domain;
            this.objectName = objectName == null ? "" : objectName;
            this.attribute = attribute == null ? "" : attribute;
            this.operation = operation == null ? "" : operation;
            this.signature = signature == null ? Collections.emptyList() : signature;
        }

        private static TargetSpec from(Map<String, Object> source) {
            if (source == null) {
                return null;
            }
            List<String> signature = new ArrayList<>();
            if (source.get("signature") instanceof List<?>) {
                for (Object item : requiredArray(source.get("signature"), "target.signature")) {
                    signature.add(requiredString(item, "target.signature item"));
                }
            }
            return new TargetSpec(
                source.get("kind") == null ? "root" : String.valueOf(source.get("kind")).trim(),
                source.get("domain") == null ? "" : String.valueOf(source.get("domain")).trim(),
                source.get("objectName") == null ? "" : String.valueOf(source.get("objectName")).trim(),
                source.get("attribute") == null ? "" : String.valueOf(source.get("attribute")).trim(),
                source.get("operation") == null ? "" : String.valueOf(source.get("operation")).trim(),
                signature
            );
        }

        private boolean isRoot() {
            return kind.isEmpty() || "root".equals(kind);
        }

        private boolean isDomain() {
            return "domain".equals(kind);
        }

        private boolean isMBean() {
            return "mbean".equals(kind);
        }

        private boolean isAttribute() {
            return "attribute".equals(kind);
        }

        private boolean isOperation() {
            return "operation".equals(kind);
        }
    }
}
