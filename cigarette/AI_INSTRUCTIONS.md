# Project Context for AI Assistants

This project runs in a Dockerized environment on a Linux VPS.
**IMPORTANT:** 
- The project uses `docker` and `docker-compose`. 
- You MUST use `sudo` for any Docker commands (e.g., `sudo docker ps`, `sudo docker-compose up`).
- The mobile app frontend is an Expo PWA located in `mobile-app/`.
- The backend is a Next.js API located in `admin-web/`.
- Do NOT run arbitrary Node/NPM commands globally if they are meant to run inside the Docker containers, unless modifying the source code for the build pipelines.
- When applying fixes to the PWA frontend, you must build the app by running `sudo npm run export` inside `mobile-app/`.
