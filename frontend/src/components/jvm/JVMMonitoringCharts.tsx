import React from "react";
import { Card, Col, Empty, Row } from "antd";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { t, type SupportedLanguage } from "../../i18n";
import type { JVMMonitoringPoint, JVMMonitoringSessionState } from "../../types";
import {
  buildMonitoringChartPoints,
  formatCompactNumber,
  formatMonitoringAxisBytes,
  monitoringMetricAvailable,
} from "../../utils/jvmMonitoringPresentation";

type JVMMonitoringChartsProps = {
  points: JVMMonitoringPoint[];
  session: JVMMonitoringSessionState;
  darkMode: boolean;
  language?: SupportedLanguage;
};

const buildCardStyle = (darkMode: boolean): React.CSSProperties => ({
  borderRadius: 18,
  height: 380,
  background: darkMode ? "#1f1f1f" : "#ffffff",
  boxShadow: "0 8px 28px rgba(15, 23, 42, 0.06)",
});

const chartMargin = { top: 18, right: 28, bottom: 26, left: 8 };
const axisTickStyle = (color: string) => ({ fill: color, fontSize: 11 });
const legendProps = {
  iconSize: 8,
  verticalAlign: "bottom" as const,
  wrapperStyle: {
    paddingTop: 14,
    lineHeight: "22px",
  },
};

const JVMMonitoringCharts: React.FC<JVMMonitoringChartsProps> = ({
  points,
  session,
  darkMode,
  language,
}) => {
  const tr = (key: string) => t(key, undefined, language);
  const data = buildMonitoringChartPoints(points, language);
  const textColor = darkMode ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.65)";
  const gridColor = darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const tooltipStyle = {
    backgroundColor: darkMode ? "#141414" : "#ffffff",
    border: `1px solid ${gridColor}`,
    borderRadius: 8,
  };

  const renderEmpty = (description: string) => (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={description}
      style={{ marginTop: 96 }}
    />
  );

  const renderCard = (title: string, content: React.ReactNode) => (
    <Card
      variant="borderless"
      title={title}
      style={buildCardStyle(darkMode)}
      styles={{ body: { height: 304, padding: "20px 22px 14px" } }}
    >
      {content}
    </Card>
  );

  const hasData = data.length > 0;

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} xl={12}>
        {renderCard(
          tr("jvm_monitoring_charts.title.heap"),
          !hasData
            ? renderEmpty(tr("jvm_monitoring_charts.empty.heap.no_samples"))
            : !monitoringMetricAvailable(session, "heap.used")
              ? renderEmpty(tr("jvm_monitoring_charts.empty.heap.metric_unavailable"))
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data} margin={chartMargin}>
                    <defs>
                      <linearGradient id="jvmHeapGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#fa8c16" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#fa8c16" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="timeLabel" tick={axisTickStyle(textColor)} axisLine={false} tickLine={false} minTickGap={32} />
                    <YAxis tick={axisTickStyle(textColor)} axisLine={false} tickLine={false} tickFormatter={formatMonitoringAxisBytes} width={74} />
                    <RechartsTooltip contentStyle={tooltipStyle} />
                    <Legend {...legendProps} />
                    <Area type="monotone" dataKey="heapUsedBytes" name={tr("jvm_monitoring_charts.legend.heap_used")} stroke="#fa8c16" fill="url(#jvmHeapGradient)" isAnimationActive={false} />
                    <Line type="monotone" dataKey="heapCommittedBytes" name={tr("jvm_monitoring_charts.legend.heap_committed")} stroke="#1677ff" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ),
        )}
      </Col>
      <Col xs={24} xl={12}>
        {renderCard(
          tr("jvm_monitoring_charts.title.gc"),
          !hasData
            ? renderEmpty(tr("jvm_monitoring_charts.empty.gc.no_samples"))
            : !monitoringMetricAvailable(session, "gc.count")
              ? renderEmpty(tr("jvm_monitoring_charts.empty.gc.metric_unavailable"))
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={chartMargin}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="timeLabel" tick={axisTickStyle(textColor)} axisLine={false} tickLine={false} minTickGap={32} />
                    <YAxis yAxisId="left" tick={axisTickStyle(textColor)} axisLine={false} tickLine={false} width={42} />
                    <YAxis yAxisId="right" orientation="right" tick={axisTickStyle(textColor)} axisLine={false} tickLine={false} width={42} />
                    <RechartsTooltip contentStyle={tooltipStyle} />
                    <Legend {...legendProps} />
                    <Line yAxisId="left" type="monotone" dataKey="gcCollectionCount" name={tr("jvm_monitoring_charts.legend.gc_count")} stroke="#52c41a" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line yAxisId="right" type="monotone" dataKey="gcCollectionTimeMs" name={tr("jvm_monitoring_charts.legend.gc_time_ms")} stroke="#722ed1" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ),
        )}
      </Col>
      <Col xs={24} xl={12}>
        {renderCard(
          tr("jvm_monitoring_charts.title.threads"),
          !hasData
            ? renderEmpty(tr("jvm_monitoring_charts.empty.threads.no_samples"))
            : !monitoringMetricAvailable(session, "thread.count")
              ? renderEmpty(tr("jvm_monitoring_charts.empty.threads.metric_unavailable"))
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={chartMargin}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="timeLabel" tick={axisTickStyle(textColor)} axisLine={false} tickLine={false} minTickGap={32} />
                    <YAxis tick={axisTickStyle(textColor)} axisLine={false} tickLine={false} width={42} />
                    <RechartsTooltip contentStyle={tooltipStyle} />
                    <Legend {...legendProps} />
                    <Line type="monotone" dataKey="threadCount" name={tr("jvm_monitoring_charts.legend.thread_count")} stroke="#1677ff" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="daemonThreadCount" name={tr("jvm_monitoring_charts.legend.daemon_thread_count")} stroke="#13c2c2" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="peakThreadCount" name={tr("jvm_monitoring_charts.legend.peak_thread_count")} stroke="#faad14" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ),
        )}
      </Col>
      <Col xs={24} xl={12}>
        {renderCard(
          tr("jvm_monitoring_charts.title.classes"),
          !hasData
            ? renderEmpty(tr("jvm_monitoring_charts.empty.classes.no_samples"))
            : !monitoringMetricAvailable(session, "class.loading")
              ? renderEmpty(tr("jvm_monitoring_charts.empty.classes.metric_unavailable"))
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={chartMargin}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="timeLabel" tick={axisTickStyle(textColor)} axisLine={false} tickLine={false} minTickGap={32} />
                    <YAxis tick={axisTickStyle(textColor)} axisLine={false} tickLine={false} tickFormatter={(value) => formatCompactNumber(Number(value), language)} width={58} />
                    <RechartsTooltip contentStyle={tooltipStyle} />
                    <Legend {...legendProps} />
                    <Line type="monotone" dataKey="loadedClassCount" name={tr("jvm_monitoring_charts.legend.loaded_classes")} stroke="#eb2f96" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="unloadedClassCount" name={tr("jvm_monitoring_charts.legend.unloaded_classes")} stroke="#8c8c8c" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ),
        )}
      </Col>
    </Row>
  );
};

export default JVMMonitoringCharts;
