# QueryPilot AI

An advanced, AI-powered Text-to-SQL data analytics platform that allows users to ask natural language questions and instantly receive SQL queries, data visualizations, and automated insights from their connected databases.

##  Key Features
- **Natural Language to SQL**: Talk to your database in plain English. The AI agent automatically understands your schema and generates the exact SQL query required.
- **Automated Insights**: Automatically generates Key Findings, KPI Cards, and detects Statistical Anomalies in your data.
- **Universal Database Support**: Connects seamlessly to PostgreSQL, MySQL, SQL Server, BigQuery, Snowflake, and SQLite.
- **Advanced Visualizations**: Automatically chooses the best chart type (Bar, Line, Pie, etc.) based on the query results.
- **Agentic Workflow**: Uses an intelligent reasoning graph to self-correct SQL syntax errors and validate queries before execution.

 <img width="1918" height="915" alt="Screenshot 2026-06-19 204632" src="https://github.com/user-attachments/assets/15bfc67e-46f4-4b0f-9d98-460391ed76dc" />
 <img width="1908" height="917" alt="Screenshot 2026-06-19 212104" src="https://github.com/user-attachments/assets/060fb6f4-0b2a-411d-8da6-d3116e93de83" />
<img width="1918" height="917" alt="Screenshot 2026-06-19 212120" src="https://github.com/user-attachments/assets/eabdd55a-59c9-4f7e-a5e3-cd45b6467e3a" />
  
## Architecture & Workflow
This project is built using a modern full-stack architecture:
- **Frontend**: React.js powered by Vite, with Lucide Icons and a stunning glassmorphism UI.
- **Backend**: Python FastAPI, utilizing LangChain and LangGraph for the AI agent orchestration.
- **Vector Database**: ChromaDB is used locally to index database schemas, allowing the AI to perfectly understand your table structures.


The Copilot utilizes a multi-agent LangGraph architecture to ensure high accuracy, safety, and self-healing query execution.

```mermaid
graph TD
    %% Define Styles
    classDef frontend fill:#3b82f6,stroke:#1e3a8a,stroke-width:2px,color:#fff;
    classDef backend fill:#10b981,stroke:#064e3b,stroke-width:2px,color:#fff;
    classDef agent fill:#8b5cf6,stroke:#4c1d95,stroke-width:2px,color:#fff;
    classDef db fill:#f59e0b,stroke:#78350f,stroke-width:2px,color:#fff;
    classDef error fill:#ef4444,stroke:#7f1d1d,stroke-width:2px,color:#fff;

    %% Components
    User((User)) -->|"Natural Language Query"| UI["React + Vite Frontend"]
    UI -->|"POST /api/chat"| API["FastAPI Backend"]

    subgraph "LangGraph Orchestration"
        API --> A["Clarify & Plan Agent"]
        A --> B["Schema RAG Agent"]
        B -.->|"Retrieve Metadata"| VDB[("ChromaDB Vector Store")]
        B --> C["SQL Generator Agent"]

        C --> D{"Guardrail Node"}
        D -->|"Unsafe"| C
        D -->|"Safe (Read-Only)"| E["Execution Agent"]

        E -.->|"Run Query"| DB[("PostgreSQL / Data Lakes")]

        E -->|"Execution Error"| F["Self-Correction Node"]
        F -->|"Fix Syntax/Columns"| C

        E -->|"Success DataFrame"| G["Forecasting Agent"]
        G -.->|"Prophet Time-Series"| G

        G --> H["Insight & SHAP Agent"]
        H -.->|"XGBoost Feature Importance"| H

        H --> I["Dashboard Design Agent"]
    end

    I -->|"JSON Dashboard Layout"| API
    API -->|"Response & Insights"| UI

    %% Styling Assignment
    class User,UI frontend;
    class API backend;
    class A,B,C,E,G,H,I agent;
    class D,F error;
    class VDB,DB db;
```

# Getting Started

## 1. Backend Setup

Navigate into the backend and start the FastAPI server:

```bash
# Create and activate a virtual environment
python -m venv venv

# On Windows
venv\Scripts\activate

# On macOS/Linux
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the backend server
uvicorn backend.main:app --reload
```

### 2. Frontend Setup
Open a new terminal window, navigate to the frontend directory, and start the React app:
```bash
cd frontend
npm install
npm run dev
```

### 3. Usage
1. Open your browser to `http://localhost:5173`.
2. Click **Add Connection** in the sidebar to link your SQL database.
3. Type a question like *"Show me the total revenue by region for the last 6 months"* into the chat!

## ENV
- GROQ API = XXXX 
