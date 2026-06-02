# Deployment Plan

## Branches

- main deploys to the live cPanel website.
- staging deploys to the cPanel staging subdomain.

## Target Flow

Codex local folder -> GitHub -> cPanel staging or production.

## cPanel Requirements

- SSH or SFTP access.
- A staging subdomain.
- Separate staging and production databases if the portal stores data.
- Deployment credentials stored as GitHub Actions secrets.

