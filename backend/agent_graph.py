from langgraph.graph import StateGraph, END
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
import sqlglot
from .models import AgentState
from .vector_store import get_all_schema_context, get_table_metadata
from .database import execute_read_query, execute_read_query_df
import pandas as pd
import numpy as np
import json
import os
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv

load_dotenv()

# Initialize LLM - Groq API
llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.1)


# Standalone ML functions (called on-demand from API endpoints)


def _select_forecast_model(df: pd.DataFrame, date_col: str, metric_col: str) -> dict:
    """
    Model Selection Engine — analyzes data characteristics to pick the best
    forecasting model instead of always defaulting to Prophet.
    
    Returns: {"model": "prophet"|"exp_smooth"|"xgboost"|"linear", "reason": str}
    """
    n_rows = len(df)
    
    # Too little data — just do linear trend
    if n_rows < 10:
        return {"model": "linear", "reason": "Too few data points (<10) for complex models"}
    
    # Prepare time series
    ts = df.set_index(date_col)[metric_col].sort_index()
    
    # Check stationarity with Augmented Dickey-Fuller test
    try:
        from statsmodels.tsa.stattools import adfuller
        adf_result = adfuller(ts.dropna(), autolag='AIC')
        is_stationary = adf_result[1] < 0.05  # p-value < 0.05 = stationary
    except Exception:
        is_stationary = False
    
    # Check for seasonality — compare variance across months
    has_seasonality = False
    try:
        if n_rows >= 24:  # Need at least 2 years for seasonality check
            monthly = ts.groupby(ts.index.month).mean()
            cv = monthly.std() / monthly.mean() if monthly.mean() != 0 else 0
            has_seasonality = cv > 0.15  # coefficient of variation > 15%
    except Exception:
        pass
    
    # Check if multiple numeric features are available for ML
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    has_features = len(numeric_cols) > 2  # More than just the target + id
    
    # Decision logic
    if has_features and n_rows >= 30:
        return {"model": "xgboost", "reason": "Multiple features available for ML regression"}
    elif has_seasonality:
        return {"model": "prophet", "reason": "Detected seasonal patterns in data"}
    elif is_stationary:
        return {"model": "exp_smooth", "reason": "Data is stationary — exponential smoothing is optimal"}
    else:
        return {"model": "prophet", "reason": "Non-stationary data with trend — Prophet handles this well"}


def run_forecast(sql_query: str, query: str) -> dict:
    """Runs forecasting on query results using auto-selected model."""
    df = execute_read_query_df(sql_query)
    if df is None or df.empty or "error" in df.columns:
        return {"error": "Could not execute query for forecasting."}
    
    try:
        date_col = next((c for c in df.columns if 'date' in c.lower() or df[c].dtype == 'datetime64[ns]'), None)
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        metric_col = next((c for c in numeric_cols if 'id' not in c.lower()), None)
        
        if not date_col or not metric_col:
            return {"error": "No suitable date/metric columns found for forecasting."}
        
        pdf = df[[date_col, metric_col]].rename(columns={date_col: 'ds', metric_col: 'y'})
        pdf['ds'] = pd.to_datetime(pdf['ds'])
        pdf = pdf.groupby('ds').sum().reset_index()
        
        if len(pdf) < 2:
            return {"error": "Not enough historical data points (minimum 2 required) to generate a trend forecast."}
            
        # Auto-select forecast model
        selection = _select_forecast_model(pdf, 'ds', 'y')
        model_name = selection["model"]
        model_reason = selection["reason"]
        
        if model_name == "prophet":
            from prophet import Prophet
            m = Prophet(yearly_seasonality=True)
            m.fit(pdf)
            future = m.make_future_dataframe(periods=90)
            forecast = m.predict(future)
            
            future_forecast = forecast[forecast['ds'] > pdf['ds'].max()].head(30)
            expected_val = future_forecast['yhat'].sum()
            lower_val = future_forecast['yhat_lower'].sum()
            upper_val = future_forecast['yhat_upper'].sum()
            
            return {
                "expected_value": f"{expected_val:,.0f}",
                "confidence_interval": f"{lower_val:,.0f} - {upper_val:,.0f}",
                "model_used": f"Prophet ({model_reason})",
                "drivers": ["Historical trend", "Yearly seasonality"],
                "forecast_data": {
                    "dates": forecast['ds'].dt.strftime('%Y-%m-%d').tolist()[-120:],
                    "actual": pdf['y'].tolist()[-90:] + [None]*30,
                    "forecast": forecast['yhat'].tolist()[-120:]
                }
            }
        
        elif model_name == "exp_smooth":
            from statsmodels.tsa.holtwinters import ExponentialSmoothing
            ts = pdf.set_index('ds')['y']
            model = ExponentialSmoothing(ts, trend='add', seasonal=None).fit()
            fcast = model.forecast(30)
            
            return {
                "expected_value": f"{fcast.sum():,.0f}",
                "confidence_interval": f"{fcast.sum() * 0.9:,.0f} - {fcast.sum() * 1.1:,.0f}",
                "model_used": f"Exponential Smoothing ({model_reason})",
                "drivers": ["Historical level", "Additive trend"],
                "forecast_data": {
                    "dates": (list(ts.index.strftime('%Y-%m-%d')[-90:]) + 
                             [d.strftime('%Y-%m-%d') for d in fcast.index]),
                    "actual": ts.tolist()[-90:] + [None]*30,
                    "forecast": [None]*min(90, len(ts)) + fcast.tolist()
                }
            }
        
        elif model_name == "linear":
            x = np.arange(len(pdf))
            coeffs = np.polyfit(x, pdf['y'].values, 1)
            future_x = np.arange(len(pdf), len(pdf) + 30)
            fcast = np.polyval(coeffs, future_x)
            
            return {
                "expected_value": f"{fcast.sum():,.0f}",
                "confidence_interval": f"{fcast.sum() * 0.85:,.0f} - {fcast.sum() * 1.15:,.0f}",
                "model_used": f"Linear Trend ({model_reason})",
                "drivers": [f"Slope: {coeffs[0]:.2f} per period"],
                "forecast_data": {
                    "dates": pdf['ds'].dt.strftime('%Y-%m-%d').tolist()[-90:] + [f"Day+{i}" for i in range(1, 31)],
                    "actual": pdf['y'].tolist()[-90:] + [None]*30,
                    "forecast": [None]*min(90, len(pdf)) + fcast.tolist()
                }
            }
        
        else:
            # xgboost fallback — use Prophet for time-series even here
            from prophet import Prophet
            m = Prophet(yearly_seasonality=True)
            m.fit(pdf)
            future = m.make_future_dataframe(periods=90)
            forecast = m.predict(future)
            future_forecast = forecast[forecast['ds'] > pdf['ds'].max()].head(30)
            
            return {
                "expected_value": f"{future_forecast['yhat'].sum():,.0f}",
                "confidence_interval": f"{future_forecast['yhat_lower'].sum():,.0f} - {future_forecast['yhat_upper'].sum():,.0f}",
                "model_used": f"Prophet (fallback from {model_name}: {model_reason})",
                "drivers": ["Historical trend", "Yearly seasonality"],
                "forecast_data": {
                    "dates": forecast['ds'].dt.strftime('%Y-%m-%d').tolist()[-120:],
                    "actual": pdf['y'].tolist()[-90:] + [None]*30,
                    "forecast": forecast['yhat'].tolist()[-120:]
                }
            }
    
    except Exception as e:
        print(f"Forecasting error: {e}")
        return {"error": str(e)}


def run_shap_analysis(sql_query: str, query: str) -> dict:
    """
    Runs XGBoost + SHAP analysis on query results.
    Returns both absolute feature importance AND signed contribution breakdown.
    """
    import xgboost as xgb
    import shap
    
    df = execute_read_query_df(sql_query)
    if df is None or df.empty or "error" in df.columns:
        return {"error": "Could not execute query for SHAP analysis."}
    
    try:
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        target_col = next((c for c in numeric_cols if 'revenue' in c.lower() or 'quantity' in c.lower()), None)
        
        if not target_col:
            return {"error": "No suitable target column found for SHAP analysis."}
        
        features_df = df.copy()
        if 'date' in features_df.columns:
            features_df['month'] = pd.to_datetime(features_df['date']).dt.month
            features_df = features_df.drop('date', axis=1)
        
        features_df = pd.get_dummies(features_df, dtype=float)
        features_df = features_df.select_dtypes(include=[np.number, bool])
        
        if len(features_df.columns) <= 1:
            return {"error": "Not enough features for SHAP analysis."}
        
        y = features_df[target_col]
        X = features_df.drop(columns=[target_col, 'id', 'product_id'], errors='ignore')
        
        if X.shape[1] == 0:
            return {"error": "No features remaining after dropping target/ID columns."}
        
        model = xgb.XGBRegressor(n_estimators=50, max_depth=3)
        model.fit(X, y)
        
        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(X)
        
        # Handle case where shap_values is a list (multi-output) — take first element
        if isinstance(shap_values, list):
            shap_values = shap_values[0]
        
        # Ensure it's a numpy array
        shap_values = np.array(shap_values)
        
        # Handle 1D case (single feature)
        if shap_values.ndim == 1:
            shap_values = shap_values.reshape(-1, 1)
        
        # Safety check: columns count must match
        n_features = min(shap_values.shape[1], len(X.columns))
        shap_values = shap_values[:, :n_features]
        feature_names = list(X.columns[:n_features])
        
        # Absolute feature importance
        mean_abs_shap = np.abs(shap_values).mean(axis=0)
        importance_dict = dict(zip(feature_names, mean_abs_shap))
        top_features = sorted(importance_dict.items(), key=lambda item: item[1], reverse=True)[:5]
        
        # Signed contribution breakdown
        mean_prediction = float(y.mean())
        contributions = []
        for i, feat in enumerate(feature_names):
            abs_val = mean_abs_shap[i]
            if abs_val == 0:
                continue
                
            feat_vals = X.iloc[:, i].values
            shap_vals = shap_values[:, i]
            
            if np.std(feat_vals) == 0 or np.std(shap_vals) == 0:
                corr = 1.0
            else:
                corr = np.corrcoef(feat_vals, shap_vals)[0, 1]
                
            direction = "positive" if corr >= 0 else "negative"
            pct = (float(abs_val) / abs(mean_prediction) * 100) if mean_prediction != 0 else 0
            
            contributions.append({
                "feature": str(feat),
                "direction": direction,
                "impact_value": round(float(abs_val), 2),
                "impact_pct": round(float(pct), 1),
            })
            
        contributions = sorted(contributions, key=lambda x: x["impact_value"], reverse=True)[:5]
        
        return {
            "title": "Key Drivers Identified (SHAP)",
            "description": f"Top factors influencing {target_col}: " + ", ".join([k for k, v in top_features]),
            "impact": "Data-driven correlation",
            "recommendation": "Focus marketing/operations on top drivers.",
            "drivers": [f"{k} ({v:.2f} impact)" for k, v in top_features],
            "contributions": contributions,
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}


# ============================================================
# Graph Agent Nodes
# ============================================================

def clarification_agent(state: AgentState) -> AgentState:
    """
    Intent + Clarification agent.
    - Fast local path for greetings (0 latency).
    - Only asks for clarification on TRULY vague queries (e.g. just "sales" or "show data").
    - Most queries with a metric + dimension go straight through.
    """
    state.timeline.append("✓ Intent Agent: Analyzing request")
    
    # Fast local heuristic for simple conversational greetings (0 latency)
    query_lower = state.query.lower().strip()
    greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening',
                 'how are you', 'sup', 'yo', 'thanks', 'thank you', 'bye', 'goodbye']
    
    if query_lower in greetings or any(query_lower.startswith(g + " ") or query_lower.startswith(g + "!") for g in greetings):
        state.intent = "conversational"
        state.final_answer = "Hello! I am your Analytics Copilot. Ask me anything about your data — sales, revenue, trends, forecasts, and more."
    schema_context = get_all_schema_context()
    
    prompt = f"""You are an enterprise BI assistant. The user sent the following message:
"{state.query}"

Available data:
{schema_context}

Your job is to classify this message into one of three categories:
1. "irrelevant": The message is completely unrelated to business analytics (e.g. pasting error traces, code snippets, casual chat, random characters).
2. "ambiguous": The message is a data request but is SO VAGUE you genuinely cannot write any reasonable SQL for it (e.g. "sales", "report").
3. "data_query": A valid data/analytics question (even if it lacks a time range, as long as a metric/entity is mentioned).

Respond in EXACTLY this JSON format:
{{
    "intent": "irrelevant" | "ambiguous" | "data_query",
    "clarification_questions": ["q1", "q2"] (only if ambiguous, otherwise empty),
    "rejection_reason": "Reason why it is irrelevant" (only if irrelevant, otherwise empty),
    "clarified_query": "the original query if data_query"
}}"""

    try:
        resp = llm.invoke([HumanMessage(content=prompt)])
        content = resp.content.replace('```json', '').replace('```', '').strip()
        parsed = json.loads(content)
        intent = parsed.get("intent", "data_query")
        
        if intent == "irrelevant":
            state.intent = "irrelevant"
            state.final_answer = parsed.get("rejection_reason", "This query appears to be unrelated to business analytics or our connected databases. Please ask a data-related question.")
            state.timeline.append("✓ Intent Agent: Rejected irrelevant query")
            return state
            
        elif intent == "ambiguous" and parsed.get("clarification_questions"):
            state.intent = "needs_clarification"
            state.clarification_questions = parsed["clarification_questions"]
            state.final_answer = "I need a bit more context to give you accurate results. Could you clarify:"
            state.timeline.append("✓ Intent Agent: Ambiguous query — asking for details")
            return state
            
        else:
            state.intent = "data_query"
            state.clarified_query = parsed.get("clarified_query") or state.query
            state.timeline.append("✓ Intent Agent: Clear data query detected")
            
    except Exception as e:
        print(f"Intent LLM error: {e}")
        state.intent = "data_query"
        state.clarified_query = state.query
        state.timeline.append("✓ Intent Agent: Data query detected (fallback)")
        
    return state

def schema_discovery_agent(state: AgentState) -> AgentState:
    state.timeline.append("✓ Schema Discovery Agent: Retrieving metadata (cached)")
    state.schema_context = get_all_schema_context()
    return state

def plan_and_generate_sql_agent(state: AgentState) -> AgentState:
    """
    Merged agent: creates a query plan AND generates SQL in a single LLM call.
    """
    state.timeline.append(f"✓ Plan & SQL Agent: Planning and writing query (Attempt {state.retries + 1})")
    
    error_context = ""
    if state.validation_errors or state.execution_error:
        error_context = f"""
        PREVIOUS ERRORS TO FIX:
        Validation Errors: {state.validation_errors}
        Execution Error: {state.execution_error}
        Previous SQL: {state.sql_query}
        Please correct the SQL query to resolve these errors.
        """

    prompt = f"""You are an expert PostgreSQL data analyst.

TASK: Answer the following business question by:
1. First, briefly outline your query plan (2-3 bullet points).
2. Then, write the SQL query.

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:
PLAN:
- step 1
- step 2

---SQL---
SELECT ...

RULES:
- Only use tables and columns from the schema context below.
- Write valid PostgreSQL syntax.
- The SQL must be a SELECT query only.
- Always include an ORDER BY clause (usually descending) when aggregating or grouping data so the results are logically sorted.
- Do NOT append a LIMIT clause unless the user explicitly asks for a specific number of records (e.g. 'top 5', 'first 10').
- IMPORTANT: If the user asks for a forecast, trend, or prediction, DO NOT try to write complex SQL to calculate moving averages or linear regressions. Simply write a basic SELECT query to fetch the historical time-series data (e.g. daily/monthly metrics) that the python forecasting engine will need.

Schema Context:
{state.schema_context}

Business Question:
{state.clarified_query}

{error_context}"""
    
    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        content = response.content.strip()
        
        if '---SQL---' in content:
            parts = content.split('---SQL---', 1)
            state.query_plan = parts[0].replace('PLAN:', '').strip()
            sql = parts[1].strip()
        else:
            state.query_plan = "Direct SQL generation"
            sql = content
        
        sql = sql.replace('```sql', '').replace('```', '').strip()
        state.sql_query = sql
        state.validation_errors = []
        state.execution_error = None
        state.is_valid_sql = False
    except Exception as e:
        state.validation_errors.append(f"LLM Error: {e}")
        state.sql_query = ""
        
    return state


def sql_guard_agent(state: AgentState) -> AgentState:
    """
    Enhanced SQL Guard with 3 validation stages:
    1. Syntax validation (SQLGlot)
    2. Security validation (block DML)
    3. Schema validation (verify tables/columns exist)
    4. Cost/pattern validation (dangerous patterns)
    """
    state.timeline.append("✓ SQL Guard Agent: Validating query")
    
    if state.validation_errors:
        return state
    
    sql = state.sql_query
    if not sql:
        state.validation_errors.append("No SQL generated.")
        return state
    
    # --- Stage 1: Syntax Validation ---
    try:
        parsed = sqlglot.parse_one(sql, read="postgres")
        if not isinstance(parsed, sqlglot.exp.Select):
            state.validation_errors.append("Security Violation: Only SELECT queries are allowed.")
            return state
    except sqlglot.errors.ParseError as e:
        state.validation_errors.append(f"Syntax Error: {e}")
        return state
    
    # --- Stage 2: Security Validation ---
    forbidden = ['insert', 'update', 'delete', 'drop', 'truncate', 'alter', 'grant', 'revoke']
    sql_lower = sql.lower()
    for word in forbidden:
        if f" {word} " in f" {sql_lower} ":
            state.validation_errors.append(f"Security Violation: '{word}' is not allowed.")
            return state
    
    # --- Stage 3: Schema Validation (verify tables/columns exist) ---
    table_meta = get_table_metadata()
    if table_meta:
        # Extract table references from AST
        try:
            referenced_tables = set()
            for table in parsed.find_all(sqlglot.exp.Table):
                tname = table.name.lower() if table.name else None
                if tname:
                    referenced_tables.add(tname)
            
            known_tables = {t.lower() for t in table_meta.keys()}
            unknown_tables = referenced_tables - known_tables
            if unknown_tables:
                state.validation_errors.append(
                    f"Schema Error: Table(s) {unknown_tables} do not exist. "
                    f"Available tables: {list(table_meta.keys())}"
                )
                return state
            
            # Extract column references and verify
            all_known_columns = set()
            for meta in table_meta.values():
                all_known_columns.update(c.lower() for c in meta.get("columns", []))
            
            for col in parsed.find_all(sqlglot.exp.Column):
                col_name = col.name.lower() if col.name else None
                if col_name and col_name not in all_known_columns:
                    # Don't flag aliases or computed columns
                    if col_name not in ('*',):
                        state.validation_errors.append(
                            f"Schema Warning: Column '{col_name}' not found in known schema. "
                            f"This may cause an execution error."
                        )
                        # Don't hard-fail — let DB try it (could be an alias)
                        break
        except Exception as e:
            print(f"Schema validation warning: {e}")
    
    # --- Stage 4: Cost/Pattern Validation ---
    try:
        sql_upper = sql.upper().strip()
        
        # Check for SELECT * without LIMIT
        has_star = any(isinstance(expr, sqlglot.exp.Star) for expr in parsed.find_all(sqlglot.exp.Star))
        has_limit = parsed.find(sqlglot.exp.Limit) is not None
        
        if has_star and not has_limit:
            # Auto-add LIMIT 1000 for safety
            state.sql_query = sql.rstrip(';') + " LIMIT 1000"
            state.timeline.append("⚠ SQL Guard: Added LIMIT 1000 to SELECT * query for safety")
        
        # Check for missing WHERE clause (potential full table scan)
        has_where = parsed.find(sqlglot.exp.Where) is not None
        has_group = parsed.find(sqlglot.exp.Group) is not None
        if not has_where and not has_group and not has_limit:
            state.timeline.append("⚠ SQL Guard: No WHERE or GROUP BY — may return large result set")
    except Exception as e:
        print(f"Cost validation warning: {e}")
    
    state.is_valid_sql = True
    return state


def execution_agent(state: AgentState) -> AgentState:
    if not state.is_valid_sql:
        state.retries += 1
        return state
        
    state.timeline.append("✓ Execution Agent: Running query")
    
    df = execute_read_query_df(state.sql_query)
    
    if "error" in df.columns:
        state.execution_error = str(df["error"].iloc[0])
        state.is_valid_sql = False
    else:
        state.query_results_df = df
        state.query_results = json.loads(df.to_json(orient='records', date_format='iso'))
        
    state.retries += 1
    return state


def _run_insight_detection(state_dict: dict) -> dict:
    """
    Advanced insight detection using multiple statistical methods:
    1. Z-Score Thresholding
    2. IQR Outlier Detection
    3. Change-Point Detection (rolling mean)
    4. Trend Detection (polyfit)
    """
    insights = []
    df_json = state_dict.get("query_results")
    if not df_json:
        return {"insights": insights}
    
    try:
        df = pd.DataFrame(df_json)
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        metric_col = next(
            (c for c in numeric_cols if 'id' not in c.lower() and ('revenue' in c.lower() or 'quantity' in c.lower())),
            next((c for c in numeric_cols if 'id' not in c.lower()), None)
        )
        
        if not metric_col or len(df) < 3:
            return {"insights": insights}
        
        values = df[metric_col].dropna()
        if len(values) < 3:
            return {"insights": insights}
        
        # --- 1. Z-Score Thresholding ---
        mean_val = values.mean()
        std_val = values.std()
        if std_val > 0:
            z_scores = (values - mean_val) / std_val
            anomaly_count = (z_scores.abs() > 2.5).sum()
            if anomaly_count > 0:
                anomaly_rows = df.loc[z_scores.abs() > 2.5]
                max_z = z_scores.abs().max()
                insights.append({
                    "title": "Z-Score Anomaly Detected",
                    "description": f"{anomaly_count} data point(s) in '{metric_col}' exceed 2.5 standard deviations from the mean (z={max_z:.1f}).",
                    "impact": "Statistical outlier — may indicate data quality issues or exceptional events",
                    "recommendation": "Investigate the flagged rows for data entry errors or genuine business events."
                })
        
        # --- 2. IQR Outlier Detection ---
        Q1 = values.quantile(0.25)
        Q3 = values.quantile(0.75)
        IQR = Q3 - Q1
        if IQR > 0:
            lower_bound = Q1 - 1.5 * IQR
            upper_bound = Q3 + 1.5 * IQR
            outliers = values[(values < lower_bound) | (values > upper_bound)]
            if len(outliers) > 0 and len(outliers) != len(values):
                insights.append({
                    "title": "IQR Outliers Found",
                    "description": f"{len(outliers)} value(s) in '{metric_col}' fall outside the interquartile range [{lower_bound:,.0f}, {upper_bound:,.0f}].",
                    "impact": f"Range: {outliers.min():,.0f} to {outliers.max():,.0f}",
                    "recommendation": "Consider segmenting analysis to understand what drives these extreme values."
                })
        
        # --- 3. Change-Point Detection (rolling mean shift) ---
        date_col = next((c for c in df.columns if 'date' in c.lower()), None)
        if date_col and len(values) >= 10:
            window = max(3, len(values) // 5)
            rolling_mean = values.rolling(window=window, center=True).mean().dropna()
            if len(rolling_mean) > 1:
                overall_mean = values.mean()
                # Find the point of maximum deviation from overall mean
                deviations = (rolling_mean - overall_mean).abs()
                max_dev_idx = deviations.idxmax()
                max_dev_val = deviations.max()
                
                if max_dev_val > overall_mean * 0.3:  # >30% shift
                    direction = "upward" if rolling_mean.loc[max_dev_idx] > overall_mean else "downward"
                    insights.append({
                        "title": "Level Shift Detected",
                        "description": f"A significant {direction} shift was detected in '{metric_col}'. The rolling average deviated {max_dev_val:,.0f} from the overall mean.",
                        "impact": f"{direction.capitalize()} shift of ~{max_dev_val/overall_mean*100:.0f}% from baseline",
                        "recommendation": f"Investigate what changed around this period to cause the {direction} trend."
                    })
        
        # --- 4. Trend Detection (polyfit) ---
        if date_col and len(values) >= 5:
            x = np.arange(len(values))
            coeffs = np.polyfit(x, values.values, 1)
            slope = coeffs[0]
            slope_pct = (slope * len(values)) / mean_val * 100 if mean_val != 0 else 0
            
            if abs(slope_pct) > 10:  # >10% total change
                direction = "upward" if slope > 0 else "downward"
                insights.append({
                    "title": f"📉 {'Upward' if slope > 0 else 'Downward'} Trend",
                    "description": f"'{metric_col}' shows a consistent {direction} trend across the dataset ({slope_pct:+.1f}% total change).",
                    "impact": f"Slope: {slope:+.2f} per period",
                    "recommendation": f"{'Capitalize on growth momentum' if slope > 0 else 'Investigate declining trend and take corrective action'}."
                })
    
    except Exception as e:
        print(f"Insight detection error: {e}")
    
    return {"insights": insights}


def _run_dashboard_generation(state_dict: dict) -> dict:
    """Dashboard generation using LLM. Thread-safe."""
    query = state_dict.get("query", "")
    df_json = state_dict.get("query_results")
    if not df_json:
        return {"dashboard_layout": None, "timeline_entry": None}
    
    try:
        df = pd.DataFrame(df_json)
        columns = list(df.columns)
        
        prompt = f"""You are an expert UI/UX dashboard designer.
The user asked: "{query}"
The data returned contains these columns: {columns}

Design a dashboard layout with up to 4 charts. 
Return ONLY a valid JSON object matching this schema:
{{
    "title": "Dashboard Title",
    "charts": [
        {{
            "id": "unique_id",
            "type": "line" or "bar" or "pie" or "metric",
            "title": "Chart Title",
            "data_source_col_x": "column_for_x_axis",
            "data_source_col_y": "column_for_y_axis"
        }}
    ]
}}"""
        resp = llm.invoke([HumanMessage(content=prompt)])
        content = resp.content.replace('```json', '').replace('```', '').strip()
        dashboard = json.loads(content)
        return {"dashboard_layout": dashboard, "timeline_entry": "✓ Dashboard Agent: Generated layout"}
    except Exception as e:
        print(f"Dashboard generation error: {e}")
        return {"dashboard_layout": None, "timeline_entry": None}


def parallel_post_analysis(state: AgentState) -> AgentState:
    """Runs insight detection, dashboard generation, and optional forecasting in PARALLEL using threads."""
    state.timeline.append("✓ Post-Analysis: Running ML analysis in parallel")
    
    state_dict = {
        "query": state.query,
        "query_results": state.query_results,
    }
    
    query_lower = state.query.lower()
    needs_forecast = any(w in query_lower for w in ["forecast", "predict", "trend", "future"])
    
    with ThreadPoolExecutor(max_workers=3) as executor:
        insight_future = executor.submit(_run_insight_detection, state_dict)
        dashboard_future = executor.submit(_run_dashboard_generation, state_dict)
        
        forecast_future = None
        if needs_forecast and state.sql_query:
            forecast_future = executor.submit(run_forecast, state.sql_query, state.query)
        
        insight_result = insight_future.result(timeout=30)
        dashboard_result = dashboard_future.result(timeout=30)
        
        if forecast_future:
            try:
                forecast_res = forecast_future.result(timeout=30)
                if "error" not in forecast_res:
                    state.forecast_result = forecast_res
                    state.timeline.append("✓ Forecasting Engine: Generated future trend predictions")
            except Exception as e:
                print(f"Auto-forecast error: {e}")
    
    if insight_result.get("insights"):
        state.insights.extend(insight_result["insights"])
        state.timeline.append(f"✓ Insight Detection: Found {len(insight_result['insights'])} insight(s)")
    
    if dashboard_result.get("dashboard_layout"):
        state.dashboard_layout = dashboard_result["dashboard_layout"]
    if dashboard_result.get("timeline_entry"):
        state.timeline.append(dashboard_result["timeline_entry"])
    
    return state


def synthesis_agent(state: AgentState) -> AgentState:
    """Final agent: synthesizes the answer."""
    state.timeline.append("✓ Synthesis Agent: Generating answer")
    
    df = state.query_results_df
    
    if df is not None and not df.empty:
        date_col = next((c for c in df.columns if 'date' in c.lower()), None)
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        metric_col = next((c for c in numeric_cols if 'id' not in c.lower()), None)
        state.has_forecast_potential = bool(date_col and metric_col)
        
        target_col = next((c for c in numeric_cols if 'revenue' in c.lower() or 'quantity' in c.lower()), None)
        # Filter out id columns to ensure we have actual features
        potential_features = [c for c in df.columns if c != target_col and c.lower() not in ['id', 'product_id', 'date']]
        state.has_explainability_potential = bool(target_col and len(potential_features) > 0)
    
    if any("Security Violation" in err for err in state.validation_errors):
        security_errors = [err for err in state.validation_errors if "Security Violation" in err]
        state.final_answer = f"🚨 **Security Alert:** Your query was blocked because it violates our safety policies.\n\n**Details:** {', '.join(security_errors)}"
    elif state.execution_error or not state.is_valid_sql:
        error_msg = f"I encountered errors generating the query after {state.retries} attempts.\n"
        if state.validation_errors:
            error_msg += f"\n**Validation Errors:** {', '.join(state.validation_errors)}"
        if state.execution_error:
            error_msg += f"\n**Execution Error:** {state.execution_error}"
        if state.sql_query:
            error_msg += f"\n**Last SQL Attempt:**\n```sql\n{state.sql_query}\n```"
        state.final_answer = error_msg
    else:
        top_results = state.query_results[:5] if state.query_results else []
        try:
            # Handle non-serializable types in top_results
            safe_results = json.dumps(top_results, default=str)
            prompt = f"""Summarize the findings for the user based on their question: "{state.query}"
Query executed successfully returning {len(state.query_results) if state.query_results else 0} rows.
Top 5 rows of data: {safe_results}
Insights generated: {str(state.insights)}

INSTRUCTIONS:
1. If the user's question is simply asking to view, list, or show records/data (e.g., "show top 5 records", "which department takes the highest salary"), DO NOT write an executive summary that just repeats the data rows in text form. Instead, simply respond with a very brief conversational intro like: "Here are the records you requested." or "I've pulled the top 5 records for you below."
2. If the user is asking an analytical question (e.g. "why did revenue drop?", "compare regional sales"), return a concise, executive-level summary in 2-3 sentences. BE SPECIFIC and quote the actual data (e.g. product names, regions, numbers)."""
            resp = llm.invoke([HumanMessage(content=prompt)])
            state.final_answer = resp.content
        except Exception as e:
            import traceback
            traceback.print_exc()
            # If there are no insights or dashboard, use a simple fallback
            if not state.insights and not state.dashboard:
                state.final_answer = "Here are the requested records below."
            else:
                state.final_answer = "Analysis complete. See charts and insights below."
            
        # Extract Business Context (RAG text) for the used tables
        from .vector_store import get_table_metadata
        tables_meta = get_table_metadata()
        business_context = []
        if state.sql_query:
            sql_lower = state.sql_query.lower()
            for t_name, meta in tables_meta.items():
                if t_name.lower() in sql_lower:
                    if meta.get("business_definition"):
                        business_context.append({
                            "term": t_name,
                            "definition": meta["business_definition"]
                        })
        state.business_context = business_context

    return state


# --- Routing Logic ---
def route_after_clarify(state: AgentState) -> str:
    if state.intent in ["conversational", "needs_clarification", "irrelevant"]:
        return "end"
    return "schema"

def should_retry(state: AgentState) -> str:
    if state.is_valid_sql and state.execution_error is None:
        return "post_analysis"
    elif any("Security Violation" in err for err in state.validation_errors):
        return "synthesize"
    elif state.retries < 3:
        return "plan_and_sql"
    else:
        return "synthesize"

# ============================================================
# Build the Optimized Graph
# ============================================================
#
#   clarify ──┬──> END  (conversational or needs_clarification)
#             └──> schema (cached) -> plan_and_sql -> sql_guard -> execute
#                                          ^                         |
#                                          └── retry (max 3) ────────┤
#                                                                    v
#                                                     parallel_post_analysis
#                                                  (insight + dashboard parallel)
#                                                                    |
#                                                                    v
#                                                             synthesis -> END

workflow = StateGraph(AgentState)

workflow.add_node("clarify", clarification_agent)
workflow.add_node("schema", schema_discovery_agent)
workflow.add_node("plan_and_sql", plan_and_generate_sql_agent)
workflow.add_node("sql_guard", sql_guard_agent)
workflow.add_node("execute", execution_agent)
workflow.add_node("post_analysis", parallel_post_analysis)
workflow.add_node("synthesize", synthesis_agent)

workflow.set_entry_point("clarify")

workflow.add_conditional_edges("clarify", route_after_clarify, {
    "end": END,
    "schema": "schema"
})
workflow.add_edge("schema", "plan_and_sql")
workflow.add_edge("plan_and_sql", "sql_guard")
workflow.add_edge("sql_guard", "execute")

workflow.add_conditional_edges("execute", should_retry, {
    "plan_and_sql": "plan_and_sql",
    "post_analysis": "post_analysis",
    "synthesize": "synthesize"
})

workflow.add_edge("post_analysis", "synthesize")
workflow.add_edge("synthesize", END)

app_graph = workflow.compile()
