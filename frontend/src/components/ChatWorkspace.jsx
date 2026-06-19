import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, FileDown, CheckCircle, AlertTriangle, TrendingUp, Brain, Loader2, HelpCircle, ChevronDown, ChevronRight, BarChart3, Box, Users, Globe, DollarSign, Database, ShieldCheck, Cpu } from 'lucide-react';
import DashboardRenderer from './DashboardRenderer';

export default function ChatWorkspace({ setActiveArtifact, initialQuery, hasDataSources, onConnectSource }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingSteps, setStreamingSteps] = useState([]);
  const [streamingSql, setStreamingSql] = useState(null);
  const [expandedSqlIdx, setExpandedSqlIdx] = useState({});
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, streamingSteps]);

  useEffect(() => {
    if (hasDataSources) {
      setMessages(prev => prev.map(msg => {
        if (msg.connectRequired) {
          return {
            ...msg,
            error: null,
            advice: null,
            connectRequired: false,
            content: "Data source is now connected! You can now run your analysis.",
            type: 'success'
          };
        }
        return msg;
      }));
    }
  }, [hasDataSources]);

  const handleSend = async (overrideQuery) => {
    const queryText = overrideQuery || input;
    if (!queryText.trim()) return;

    if (!hasDataSources) {
      setMessages(prev => [
        ...prev,
        { role: 'user', content: queryText },
        { role: 'assistant', type: 'error', error: "No data sources connected", advice: "Please connect a database before running analysis.", connectRequired: true }
      ]);
      if (!overrideQuery) setInput('');
      return;
    }

    const userMsg = { role: 'user', content: queryText };
    setMessages(prev => [...prev, userMsg]);
    if (!overrideQuery) setInput('');
    setLoading(true);
    setStreamingSteps([]);
    setStreamingSql(null);

    try {
      const response = await fetch('http://localhost:8000/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryText }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'progress') {
                setStreamingSteps(prev => [...prev, event.step]);
              } else if (event.type === 'sql') {
                setStreamingSql(event.generated_sql);
              } else if (event.type === 'complete') {
                setMessages(prev => [...prev, { role: 'assistant', data: event.data }]);
                setStreamingSteps([]);
                setStreamingSql(null);
                // If they have charts/KPIs, show the button.
                // The user can click 'View Advanced Charts' manually.
              } else if (event.type === 'error') {
                setMessages(prev => [...prev, { role: 'assistant', error: event.message }]);
                setStreamingSteps([]);
                setStreamingSql(null);
              }
            } catch (parseErr) { /* skip */ }
          }
        }
      }
    } catch (err) {
      try {
        const res = await axios.post('http://localhost:8000/api/chat', { query: queryText });
        setMessages(prev => [...prev, { role: 'assistant', data: res.data }]);
        // No auto-open for artifact panel here.
      } catch (fallbackErr) {
        setMessages(prev => [...prev, { role: 'assistant', error: 'Connection failed. Is the backend running?' }]);
      }
      setStreamingSteps([]);
      setStreamingSql(null);
    }
    setLoading(false);
  };

  const handleClarificationClick = (question) => {
    handleSend(question);
  };

  const toggleSql = (idx) => {
    setExpandedSqlIdx(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleForecast = async (msgIdx) => {
    const msg = messages[msgIdx];
    if (!msg?.data?.generated_sql) return;

    setMessages(prev => prev.map((m, i) =>
      i === msgIdx ? { ...m, forecastLoading: true } : m
    ));

    try {
      const res = await axios.post('http://localhost:8000/api/forecast', {
        sql_query: msg.data.generated_sql,
        query: messages[msgIdx - 1]?.content || '',
      });

      setMessages(prev => prev.map((m, i) =>
        i === msgIdx ? {
          ...m,
          forecastLoading: false,
          data: { ...m.data, forecast: res.data }
        } : m
      ));

      // Auto-open artifact panel for forecast
      setActiveArtifact(prev => ({
        ...prev,
        forecast: res.data
      }));
    } catch (err) {
      setMessages(prev => prev.map((m, i) =>
        i === msgIdx ? { ...m, forecastLoading: false, forecastError: err.response?.data?.detail || 'Forecast failed' } : m
      ));
    }
  };

  const handleExplain = async (msgIdx) => {
    const msg = messages[msgIdx];
    if (!msg?.data?.generated_sql) return;

    setMessages(prev => prev.map((m, i) =>
      i === msgIdx ? { ...m, explainLoading: true } : m
    ));

    try {
      const res = await axios.post('http://localhost:8000/api/explain', {
        sql_query: msg.data.generated_sql,
        query: messages[msgIdx - 1]?.content || '',
      });

      setMessages(prev => prev.map((m, i) =>
        i === msgIdx ? {
          ...m,
          explainLoading: false,
          data: {
            ...m.data,
            insights: [...(m.data.insights || []), res.data]
          }
        } : m
      ));
    } catch (err) {
      setMessages(prev => prev.map((m, i) =>
        i === msgIdx ? { ...m, explainLoading: false, explainError: err.response?.data?.detail || 'Analysis failed' } : m
      ));
    }
  };



  const generateKpiCards = (results, sqlQuery) => {
    if (!results || results.length === 0) return null;

    // Heuristic: Only show KPI cards if the SQL was analytical (Aggregation or Grouping) or returned exactly 1 row.
    // Summing up rows from a raw data dump (e.g. SELECT * LIMIT 5) produces meaningless metrics.
    const sql = (sqlQuery || '').toLowerCase();
    const isAnalytical = results.length === 1 ||
      sql.includes('group by') ||
      sql.includes('sum(') ||
      sql.includes('avg(') ||
      sql.includes('count(');

    if (!isAnalytical) return null;

    const totals = {};
    const numericKeys = [];

    // Identify numeric columns (excluding IDs, numbers, years, etc.)
    for (const key of Object.keys(results[0])) {
      const k = key.toLowerCase();
      if (typeof results[0][key] === 'number' &&
        !k.includes('id') && !k.endsWith('no') && !k.endsWith('num') &&
        !k.includes('code') && k !== 'year' && k !== 'month') {
        numericKeys.push(key);
        totals[key] = 0;
      }
    }

    // Sum the values across the entire result set
    for (const row of results) {
      for (const key of numericKeys) {
        if (typeof row[key] === 'number') {
          totals[key] += row[key];
        }
      }
    }

    const kpis = [];
    for (const key of numericKeys) {
      let value = totals[key];
      let formattedVal = value;
      if (value > 1000000) formattedVal = `$${(value / 1000000).toFixed(1)}M`;
      else if (value > 1000) formattedVal = `${(value / 1000).toFixed(1)}k`;
      else if (value % 1 !== 0) formattedVal = value.toFixed(2);

      // Auto-prefix revenue/sales with $
      if (key.toLowerCase().includes('revenue') || key.toLowerCase().includes('sales') || key.toLowerCase().includes('price')) {
        if (!String(formattedVal).startsWith('$')) formattedVal = `$${formattedVal}`;
      }

      kpis.push({ label: key.replace(/_/g, ' ').toUpperCase(), value: formattedVal });
      if (kpis.length >= 3) break;
    }

    if (kpis.length === 0) return null;

    return (
      <div className="kpi-grid">
        {kpis.map((kpi, i) => (
          <div key={i} className="kpi-card">
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{kpi.value}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderContributions = (contributions) => {
    if (!contributions || contributions.length === 0) return null;
    return (
      <div className="explainability-panel">
        <div className="panel-header" style={{ color: 'var(--text-primary)' }}>Forecast Drivers (SHAP)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
          {contributions.map((c, i) => (
            <div key={i} className="contribution-row">
              <span className={`contribution-sign ${c.direction}`}>
                {c.direction === 'positive' ? '+' : '−'}
              </span>
              <span className="contribution-feature">{c.feature}</span>
              <span className={`contribution-value ${c.direction}`}>
                {c.direction === 'positive' ? '+' : '−'}{Math.abs(c.impact_pct)}%
              </span>
              <div className="contribution-bar-bg">
                <div
                  className={`contribution-bar ${c.direction}`}
                  style={{ width: `${Math.min(Math.abs(c.impact_pct) * 2, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };
  useEffect(() => {
    if (initialQuery) {
      handleSend(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="chat-container">
      <div className="messages-area" style={{ padding: '32px 0', width: '100%', maxWidth: '1100px', margin: '0 auto' }}>
        {messages.length === 0 && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '40px 20px' }}
          >
            <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'linear-gradient(135deg, rgba(79, 140, 255, 0.2), rgba(139, 92, 246, 0.2))', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', boxShadow: '0 0 32px rgba(79, 140, 255, 0.15)' }}>
              <Brain size={32} color="var(--accent-primary)" />
            </div>
            <h2 className="display-font" style={{ color: 'var(--text-primary)', marginBottom: '12px', textAlign: 'center', fontSize: '2.5rem', fontWeight: 600, letterSpacing: '-0.03em' }}>Decision Intelligence Platform</h2>
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '48px', fontSize: '1.1rem', maxWidth: '600px', lineHeight: '1.6' }}>
              Connect your data infrastructure to run complex analytical queries, generate forecasts, and build interactive dashboards in seconds.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', width: '100%', maxWidth: '800px' }}>
              <motion.div whileHover={{ y: -4, boxShadow: '0 12px 24px rgba(0,0,0,0.3)' }} onClick={() => handleSend("Forecast next month's revenue")} style={{ padding: '20px', borderRadius: '12px', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', cursor: 'pointer', transition: 'all 0.2s' }}>
                <TrendingUp size={20} color="var(--accent-primary)" style={{ marginBottom: '12px' }} />
                <div style={{ fontWeight: 500, marginBottom: '4px', color: 'var(--text-primary)' }}>Revenue Forecast</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Project Q4 numbers using historical patterns</div>
              </motion.div>
              <motion.div whileHover={{ y: -4, boxShadow: '0 12px 24px rgba(0,0,0,0.3)' }} onClick={() => handleSend("Show sales by region as a bar chart")} style={{ padding: '20px', borderRadius: '12px', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', cursor: 'pointer', transition: 'all 0.2s' }}>
                <Globe size={20} color="var(--accent-secondary)" style={{ marginBottom: '12px' }} />
                <div style={{ fontWeight: 500, marginBottom: '4px', color: 'var(--text-primary)' }}>Regional Sales</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Visualize geographic performance</div>
              </motion.div>
              <motion.div whileHover={{ y: -4, boxShadow: '0 12px 24px rgba(0,0,0,0.3)' }} onClick={() => handleSend("Identify root causes for user churn")} style={{ padding: '20px', borderRadius: '12px', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', cursor: 'pointer', transition: 'all 0.2s' }}>
                <Users size={20} color="var(--warning)" style={{ marginBottom: '12px' }} />
                <div style={{ fontWeight: 500, marginBottom: '4px', color: 'var(--text-primary)' }}>Churn Analysis</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Find key drivers of customer attrition</div>
              </motion.div>
            </div>
          </motion.div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <div className={`avatar ${msg.role}`}>
              {msg.role === 'user' ? 'U' : 'AI'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', width: msg.role === 'assistant' ? '100%' : 'auto', maxWidth: msg.role === 'user' ? '85%' : '100%' }}>
              <div className="message-bubble">
                {msg.content && <div style={{ whiteSpace: 'pre-wrap', fontSize: '1.05rem' }}>{msg.content}</div>}
                {msg.error && <div style={{ color: 'var(--danger)', fontWeight: 500 }}>{msg.error}</div>}
                {msg.advice && <div style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>{msg.advice}</div>}
                {msg.connectRequired && onConnectSource && (
                  <button
                    className="btn btn-primary"
                    onClick={onConnectSource}
                    style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <Database size={16} /> Connect Data Source
                  </button>
                )}

                {msg.data && (
                  <div style={{ marginTop: '16px' }}>

                    {/* Executive Summary Card (Top) */}
                    {msg.data.answer && !msg.data.clarification_questions && (
                      <div className="executive-summary">
                        <div className="summary-title">Executive Summary</div>
                        <div className="summary-text">{msg.data.answer}</div>
                      </div>
                    )}

                    {/* Clarification Flow (Ambiguity #3) */}
                    {msg.data.clarification_questions && msg.data.clarification_questions.length > 0 && (
                      <div className="clarification-section">
                        <div style={{ whiteSpace: 'pre-wrap', marginBottom: '16px', fontSize: '1.05rem' }}>{msg.data.answer}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                          <HelpCircle size={18} style={{ color: 'var(--accent-primary)' }} />
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Suggested clarifications:</span>
                        </div>
                        <div className="clarification-chips">
                          {msg.data.clarification_questions.map((q, i) => (
                            <button
                              key={i}
                              className="clarification-chip"
                              onClick={() => handleClarificationClick(q)}
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {!msg.data.clarification_questions && (
                      <>
                        <div className="response-grid">
                          {/* Left Column: Data Table & Content */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
                            {/* Inline Data Table */}
                            {msg.data.query_results && msg.data.query_results.length > 0 && (
                              <div className="glass-panel" style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                  <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                                      {Object.keys(msg.data.query_results[0]).map(key => (
                                        <th key={key} style={{ padding: '12px 16px', position: 'sticky', top: 0, backgroundColor: 'rgba(30, 41, 59, 0.95)', backdropFilter: 'blur(4px)', zIndex: 10 }}>{key.toUpperCase()}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {msg.data.query_results.slice(0, 50).map((row, i) => (
                                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background-color 0.2s' }}>
                                        {Object.values(row).map((val, j) => (
                                          <td key={j} style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>{val !== null ? val.toString() : 'NULL'}</td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                {msg.data.query_results.length > 50 && (
                                  <div style={{ textAlign: 'center', padding: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)' }}>
                                    Showing top 50 of {msg.data.query_results.length} rows
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Artifact Link (Only for Visualizations) */}
                            {(msg.data.dashboard || msg.data.forecast) && (
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', width: '100%', fontSize: '1rem', borderStyle: 'dashed' }}
                                onClick={() => setActiveArtifact(msg.data)}
                              >
                                <BarChart3 size={18} /> View Advanced Charts
                              </button>
                            )}
                            {/* On-Demand Action Buttons */}
                            {(msg.data.has_forecast_potential || msg.data.has_explainability_potential) && (
                              <div className="on-demand-actions" style={{ marginTop: '0' }}>
                                {msg.data.has_forecast_potential && !msg.data.forecast && (
                                  <button
                                    className="btn-on-demand forecast"
                                    onClick={() => handleForecast(idx)}
                                    disabled={msg.forecastLoading}
                                  >
                                    {msg.forecastLoading ? (
                                      <><Loader2 size={16} className="spinner" /> Running Forecast...</>
                                    ) : (
                                      <><TrendingUp size={16} /> Generate Forecast</>
                                    )}
                                  </button>
                                )}
                                {msg.forecastError && (
                                  <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '4px' }}>
                                    <AlertTriangle size={14} /> {msg.forecastError}
                                  </div>
                                )}

                                {msg.data.has_explainability_potential && (!msg.data.insights || !msg.data.insights.some(i => i.title && i.title.includes('SHAP'))) && (
                                  <button
                                    className="btn-on-demand explain"
                                    onClick={() => handleExplain(idx)}
                                    disabled={msg.explainLoading}
                                  >
                                    {msg.explainLoading ? (
                                      <><Loader2 size={16} className="spinner" /> Running SHAP Analysis...</>
                                    ) : (
                                      <><Brain size={16} /> Analyze Drivers (SHAP)</>
                                    )}
                                  </button>
                                )}
                                {msg.explainError && (
                                  <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '4px' }}>
                                    <AlertTriangle size={14} /> {msg.explainError}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Right Column: Context, Transparency & Insights */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Business Context Panel */}
                            {msg.data.business_context && msg.data.business_context.length > 0 && (
                              <div className="glass-panel" style={{ padding: '16px' }}>
                                <div className="panel-header">Business Context</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                  {msg.data.business_context.map((ctx, i) => (
                                    <div key={i} className="context-item">
                                      <div style={{ fontWeight: 600, color: 'var(--accent-primary)', fontSize: '0.9rem' }}>{ctx.term}</div>
                                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{ctx.definition}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* SQL Transparency Panel */}
                            {msg.data.generated_sql && (
                              <div className="glass-panel" style={{ padding: '16px' }}>
                                <div
                                  className="panel-header"
                                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 }}
                                  onClick={() => toggleSql(idx)}
                                >
                                  <span>SQL Transparency</span>
                                  {expandedSqlIdx[idx] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                </div>
                                {expandedSqlIdx[idx] && (
                                  <div style={{ marginTop: '16px' }}>
                                    <div className="code-block">{msg.data.generated_sql}</div>
                                    <div style={{ marginTop: '12px', color: 'var(--success)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <CheckCircle size={14} /> Safe Query • Read-Only Access
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* AI Generated Insights (Key Findings) */}
                            {msg.data.insights && msg.data.insights.length > 0 && (
                              <div className="glass-panel" style={{ padding: '20px' }}>
                                <div className="panel-header" style={{ marginBottom: '16px', fontSize: '1.1rem' }}>Key Findings</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                  {msg.data.insights.map((ins, i) => (
                                    <div key={i} className="insight-item">
                                      <div className="insight-number">{i + 1}</div>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{ins.title}</div>
                                        <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>{ins.description}</div>
                                        {/* Render SHAP contributions if present */}
                                        {ins.contributions && renderContributions(ins.contributions)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Live Streaming Progress Indicator (Framer Motion Animated Timeline) */}
        {loading && (
          <div className="message assistant">
            <div className="avatar assistant" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', color: 'var(--accent-primary)' }}>
              <Brain size={18} />
            </div>
            <motion.div
              className="message-bubble glass-panel"
              style={{ width: '100%', padding: '24px' }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Loader2 size={20} color="var(--accent-primary)" />
                </motion.div>
                <span style={{ fontSize: '1.05rem', color: 'var(--text-primary)', fontWeight: 600 }}>Executing Agentic Workflow</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
                {/* Timeline vertical line */}
                {streamingSteps.length > 0 && (
                  <div style={{ position: 'absolute', left: '11px', top: '24px', bottom: '16px', width: '2px', background: 'var(--border-color)', zIndex: 0 }} />
                )}

                <AnimatePresence>
                  {streamingSteps.map((step, i) => {
                    const cleanStep = step.startsWith("✓ ") ? step.substring(2) : step;
                    const isLast = i === streamingSteps.length - 1;

                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3 }}
                        style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', position: 'relative', zIndex: 1 }}
                      >
                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: isLast ? 'var(--bg-panel)' : 'var(--success)', border: isLast ? '2px solid var(--accent-primary)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                          {isLast ? (
                            <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-primary)' }} />
                            </motion.div>
                          ) : (
                            <CheckCircle size={14} color="#000" />
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', paddingTop: '2px' }}>
                          <span style={{ color: isLast ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: isLast ? 500 : 400 }}>{cleanStep}</span>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {streamingSteps.length === 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--bg-panel)', border: '2px solid var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-primary)' }} />
                      </motion.div>
                    </div>
                    <span style={{ color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 500 }}>Initializing AI Engine...</span>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ padding: '24px 32px', background: 'var(--bg-dark)', width: '100%', display: 'flex', justifyContent: 'center', borderTop: '1px solid var(--border-color)' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: '1100px' }}>
          <input
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask a business question... (e.g. Compare regional performance)"
            style={{ width: '100%', padding: '16px 20px', paddingRight: '56px', borderRadius: '12px', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '1rem', outline: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: input.trim() && !loading ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)', color: input.trim() && !loading ? '#fff' : 'var(--text-secondary)', border: 'none', width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}
          >
            {loading ? <Loader2 size={18} className="spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
