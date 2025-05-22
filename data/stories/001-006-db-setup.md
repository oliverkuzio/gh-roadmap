---
title: db setup
label: Project Setup
role:
action:
benefit:
---

Example schema:

```mermaid
erDiagram
    user {
        integer id
        text name
        text email
        integer email_verified
        integer created_at
        integer updated_at
    }
    entity {
        integer id
        text name
        text slug
        integer user_id
        integer created_at
        integer updated_at
    }
    entity_child {
        integer id
        text name
        text slug
        integer entity_id
        integer user_id
        integer created_at
        integer updated_at
    }

    entity }o--|| user : "user_id"
    entity_child }o--|| entity : "entity_id"
    entity_child }o--|| user : "user_id"
```

- [ ] Database schema is defined
- [ ] Migration system is configured
- [ ] Database is created / migrated locally (not in the cloud)
- [ ] Database connection is properly configured
- [ ] Environment variables are documented
