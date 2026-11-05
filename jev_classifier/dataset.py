"""
dataset.py — Gold-standard test dataset for severity, intent, and department classification.

Extracted from the existing LLM evaluation benchmark used in
results/classification_metrics_report.json so metrics are directly comparable.
"""

# ── Severity + Intent Test Cases (42 samples) ────────────────────────────────
# Each entry: (text, expected_severity, expected_intent)

SEVERITY_DATASET = [
    # LOW / QUERY (10 samples)
    ("What is the company's earned leave policy?", "LOW", "QUERY"),
    ("How many casual leaves am I entitled to per year?", "LOW", "QUERY"),
    ("What is the purpose of the POSH policy?", "LOW", "QUERY"),
    ("What is the dress code policy for employees?", "LOW", "QUERY"),
    ("How do I apply for maternity leave?", "LOW", "QUERY"),
    ("What are the working hours at Puravankara?", "LOW", "QUERY"),
    ("Can you explain the whistleblower protection policy?", "LOW", "QUERY"),
    ("I want to know the detailed procedure and timeline for the annual performance appraisal cycle.", "LOW", "QUERY"),
    ("How can I report an unsafe working condition or safety violation observed at an active construction site?", "LOW", "QUERY"),
    ("What is the code of business conduct and ethics for corporate employees at Puravankara?", "LOW", "QUERY"),

    # MEDIUM / GRIEVANCE (13 samples)
    ("My salary has not been credited this month and I have followed up with HR three times without any response.", "MEDIUM", "GRIEVANCE"),
    ("My leave balance in the LMS portal is showing incorrect numbers. I have raised tickets with IT and HR but the count remains wrong.", "MEDIUM", "GRIEVANCE"),
    ("My manager is consistently giving me lower performance ratings despite my target achievements being above 100%.", "MEDIUM", "GRIEVANCE"),
    ("I am unable to access the LMS to complete my mandatory compliance training module due to repeated account lockout.", "MEDIUM", "GRIEVANCE"),
    ("I haven't been paid my overtime compensation for the last two months despite multiple manager approvals on record.", "MEDIUM", "GRIEVANCE"),
    ("There is a major discrepancy between the area mentioned in my sale agreement and the actual carpet area measured by the surveyor.", "MEDIUM", "GRIEVANCE"),
    ("I was charged unexpected infrastructure charges that were never mentioned or disclosed during the booking agreement signing.", "MEDIUM", "GRIEVANCE"),
    ("I reported multiple snag items during pre-possession inspection but none have been resolved prior to key handover.", "MEDIUM", "GRIEVANCE"),
    ("Heavy construction vehicles are damaging the public access road and blocking regular community traffic throughout the day.", "MEDIUM", "GRIEVANCE"),
    ("I need to transfer physical shares to demat form and have been trying to contact the Registrar for weeks with zero response.", "MEDIUM", "GRIEVANCE"),
    ("My manager constantly shouts at me and humiliates me in front of the team during daily operational review meetings.", "MEDIUM", "GRIEVANCE"),
    ("There is complete water supply interruption in my flat for the past 3 days and the facility management desk refuses to answer calls.", "MEDIUM", "GRIEVANCE"),
    ("The compound boundary wall provided around the residential tower is damaged, unstable, and in danger of collapsing.", "MEDIUM", "GRIEVANCE"),

    # HIGH / GRIEVANCE (19 samples)
    ("My manager has been making sexually suggestive comments about my appearance and repeatedly asking me out after work.", "HIGH", "GRIEVANCE"),
    ("A senior colleague has been sending me unwanted sexual messages on WhatsApp and making advances during late shifts.", "HIGH", "GRIEVANCE"),
    ("There has been a quid pro quo situation where my manager implied career promotion benefits in exchange for personal favors.", "HIGH", "GRIEVANCE"),
    ("I am being sexually harassed at work events by a vendor representative who makes inappropriate physical contact.", "HIGH", "GRIEVANCE"),
    ("The salesperson promised my apartment would be in a gated community with Italian marble flooring, but cheap vitrified tiles were delivered.", "HIGH", "GRIEVANCE"),
    ("My possession date was promised for December 2024 but has been delayed indefinitely with no compensation or explanation.", "HIGH", "GRIEVANCE"),
    ("The sales executive demanded an unofficial payment of 2 lakhs as a kickback to ensure apartment allotment on preferred floor.", "HIGH", "GRIEVANCE"),
    ("There is severe water seepage in my bedroom wall. I reported it two weeks ago but nobody attended to fix it.", "HIGH", "GRIEVANCE"),
    ("The elevator in our building has been broken for a week and there are elderly residents trapped on upper floors.", "HIGH", "GRIEVANCE"),
    ("There is a major plumbing leak in my bathroom and the water is damaging the flooring and seeping into the apartment below.", "HIGH", "GRIEVANCE"),
    ("The electrical circuit in my flat keeps tripping and there is a burning smell coming from the main distribution panel.", "HIGH", "GRIEVANCE"),
    ("The construction site is generating massive dust clouds that are affecting the neighborhood air quality and resident health.", "HIGH", "GRIEVANCE"),
    ("Construction laborers on the 14th floor are working without safety harnesses or safety helmets in clear violation of labor regulations.", "HIGH", "GRIEVANCE"),
    ("The project's Sewage Treatment Plant (STP) is malfunctioning and discharging untreated sewage into the adjoining public drain.", "HIGH", "GRIEVANCE"),
    ("The project construction has blocked the natural rainwater drainage channel, causing severe waterlogging in surrounding residential plots.", "HIGH", "GRIEVANCE"),
    ("I am a shareholder and have not received the dividend declared for the last financial year despite sending registered mail.", "HIGH", "GRIEVANCE"),
    ("As an institutional investor, I have serious concerns about the accuracy and transparency of the quarterly financial statement disclosures.", "HIGH", "GRIEVANCE"),
    ("Unannounced project delays and cost overruns are severely affecting the company's financial valuation and shareholder returns.", "HIGH", "GRIEVANCE"),
    ("I discovered that senior management is involved in systematic bribery of municipal officials to obtain irregular building sanction approvals.", "HIGH", "GRIEVANCE"),
]


# ── Department Test Cases (32 samples) ────────────────────────────────────────
# Each entry: (text, expected_department)

DEPARTMENT_DATASET = [
    # HR (6 samples)
    ("My salary has not been credited this month and I have followed up with HR three times without any response.", "HR"),
    ("My leave balance in the LMS portal is showing incorrect numbers. I have raised tickets with IT and HR but the count remains wrong.", "HR"),
    ("My manager is consistently giving me lower performance ratings despite my target achievements being above 100%.", "HR"),
    ("I am unable to access the LMS to complete my mandatory compliance training module due to repeated account lockout.", "HR"),
    ("I haven't been paid my overtime compensation for the last two months despite multiple manager approvals on record.", "HR"),
    ("My manager constantly shouts at me and humiliates me in front of the team during daily operational review meetings.", "HR"),

    # IC (4 samples)
    ("My manager has been making sexually suggestive comments about my appearance and repeatedly asking me out after work.", "IC"),
    ("A senior colleague has been sending me unwanted sexual messages on WhatsApp and making advances during late shifts.", "IC"),
    ("There has been a quid pro quo situation where my manager implied career promotion benefits in exchange for personal favors.", "IC"),
    ("I am being sexually harassed at work events by a vendor representative who makes inappropriate physical contact.", "IC"),

    # CRM (6 samples)
    ("The salesperson promised my apartment would be in a gated community with Italian marble flooring, but cheap vitrified tiles were delivered.", "CRM"),
    ("My possession date was promised for December 2024 but has been delayed indefinitely with no compensation or explanation.", "CRM"),
    ("The sales executive demanded an unofficial payment of 2 lakhs as a kickback to ensure apartment allotment on preferred floor.", "CRM"),
    ("There is a major discrepancy between the area mentioned in my sale agreement and the actual carpet area measured by the surveyor.", "CRM"),
    ("I was charged unexpected infrastructure charges that were never mentioned or disclosed during the booking agreement signing.", "CRM"),
    ("I discovered that senior management is involved in systematic bribery of municipal officials to obtain irregular building sanction approvals.", "CRM"),

    # CSD (7 samples)
    ("There is severe water seepage in my bedroom wall. I reported it two weeks ago but nobody attended to fix it.", "CSD"),
    ("The elevator in our building has been broken for a week and there are elderly residents trapped on upper floors.", "CSD"),
    ("I reported multiple snag items during pre-possession inspection but none have been resolved prior to key handover.", "CSD"),
    ("There is a major plumbing leak in my bathroom and the water is damaging the flooring and seeping into the apartment below.", "CSD"),
    ("The electrical circuit in my flat keeps tripping and there is a burning smell coming from the main distribution panel.", "CSD"),
    ("There is complete water supply interruption in my flat for the past 3 days and the facility management desk refuses to answer calls.", "CSD"),
    ("The compound boundary wall provided around the residential tower is damaged, unstable, and in danger of collapsing.", "CSD"),

    # ESG (5 samples)
    ("The construction site is generating massive dust clouds that are affecting the neighborhood air quality and resident health.", "ESG"),
    ("Construction laborers on the 14th floor are working without safety harnesses or safety helmets in clear violation of labor regulations.", "ESG"),
    ("The project's Sewage Treatment Plant (STP) is malfunctioning and discharging untreated sewage into the adjoining public drain.", "ESG"),
    ("The project construction has blocked the natural rainwater drainage channel, causing severe waterlogging in surrounding residential plots.", "ESG"),
    ("Heavy construction vehicles are damaging the public access road and blocking regular community traffic throughout the day.", "ESG"),

    # Investors (4 samples)
    ("I am a shareholder and have not received the dividend declared for the last financial year despite sending registered mail.", "Investors"),
    ("As an institutional investor, I have serious concerns about the accuracy and transparency of the quarterly financial statement disclosures.", "Investors"),
    ("I need to transfer physical shares to demat form and have been trying to contact the Registrar for weeks with zero response.", "Investors"),
    ("Unannounced project delays and cost overruns are severely affecting the company's financial valuation and shareholder returns.", "Investors"),
]
