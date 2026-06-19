import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from typing import Dict, Any, List
import uuid

# In-memory storage for saved reports (in Phase 3, usually backed by PostgreSQL)
_SAVED_REPORTS: List[Dict[str, Any]] = []

def save_report(title: str, query: str, data: Dict[str, Any]) -> str:
    report_id = str(uuid.uuid4())
    report = {
        "id": report_id,
        "title": title,
        "query": query,
        "data": data # Contains final_answer, dashboard JSON, insights etc.
    }
    _SAVED_REPORTS.append(report)
    return report_id

def get_saved_reports() -> List[Dict[str, str]]:
    return [{"id": r["id"], "title": r["title"]} for r in _SAVED_REPORTS]

def generate_pdf_report(state_data: Dict[str, Any], output_path: str = "report.pdf") -> str:
    """Generates a PDF executive summary based on the agent state."""
    
    doc = SimpleDocTemplate(output_path, pagesize=letter)
    styles = getSampleStyleSheet()
    
    # Custom Styles
    title_style = styles['Heading1']
    subtitle_style = styles['Heading2']
    normal_style = styles['Normal']
    
    elements = []
    
    # Title
    elements.append(Paragraph(f"AI Analytics Executive Report", title_style))
    elements.append(Spacer(1, 0.2 * inch))
    
    # Query
    elements.append(Paragraph(f"<b>Business Question:</b> {state_data.get('query', '')}", normal_style))
    elements.append(Spacer(1, 0.2 * inch))
    
    # Summary
    elements.append(Paragraph("<b>Executive Summary</b>", subtitle_style))
    elements.append(Paragraph(state_data.get('final_answer', 'No summary available.'), normal_style))
    elements.append(Spacer(1, 0.3 * inch))
    
    # Insights
    insights = state_data.get('insights', [])
    if insights:
        elements.append(Paragraph("<b>Key Insights Detected</b>", subtitle_style))
        for ins in insights:
            text = f"• <b>{ins['title']}</b>: {ins['description']}"
            if ins.get('recommendation'):
                text += f" <i>Recommendation: {ins['recommendation']}</i>"
            elements.append(Paragraph(text, normal_style))
            elements.append(Spacer(1, 0.1 * inch))
            
    # SQL Transparency
    sql_query = state_data.get('sql_query')
    if sql_query:
        elements.append(Spacer(1, 0.2 * inch))
        elements.append(Paragraph("<b>SQL Query Used (Transparency)</b>", subtitle_style))
        elements.append(Paragraph(f"<font name='Courier'>{sql_query}</font>", normal_style))
        
    # Build PDF
    doc.build(elements)
    
    return output_path
