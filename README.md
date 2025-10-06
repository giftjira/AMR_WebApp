Overview

The AMR Project enables automated material handling within a manufacturing facility. The system allows workers to request autonomous carts from a web app on handheld devices or touchscreen terminals, while tracking AMR tasks in real-time.

Features

🚗 AMR commutes material carts between designated start and end points.

🌐 Web app interface for task creation and status monitoring.

📱 Handheld + touchscreen devices for user interaction.

⚙️ AMR hardware managed by RCS web application and configured via Walle app.

🔄 Web app communicates with AMR via API, with task and status stored in a MySQL database.

Technologies

AMR hardware + RCS (Robot Control System)

Walle Application (AMR setup/configuration)

Web App: React (developed in VS Code)

Backend: MySQL database + API integration

Development Tools: Postman, VS Code

Workflow

Worker selects start and end point via handheld or touchscreen device.

Web app sends task request via API to AMR system.

RCS executes AMR task, managed by Walle configuration.

Task progress and AMR status are updated in real-time in the web app.
