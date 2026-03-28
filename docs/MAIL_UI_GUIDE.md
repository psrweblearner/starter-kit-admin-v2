# Mail UI Guide (Intern Friendly, Table-Based)

Mail runs only when table data changes:
- create
- update
- delete

If no table change happens, no mail is sent.

## 1) Open Mail UI

- Go to admin menu `email-template`
- Click `Create` for new template
- Click row `Edit` to update template

## 2) Every Field Explained (UI)

### Rule Name (`description`) - text
- Required: yes
- Team label only
- Example: `Forget OTP Mail`

### Email Mode (`mail`) - dropdown
- `Send mail` = real email
- `Log only` = no send, only log

### Model (`module`) - dropdown
- Select table/model like `Otp`, `Blog`, `AdminUser`
- `*` means all models

### Operation (`operation`) - dropdown
- `create`, `update`, `delete`, `Any operation`

### Trigger Rule (`triggerOn`) - dropdown
- `always`
- `status_change`
- `field_change`
- `custom_condition`

### Watched Fields (`watchedFields`) - text
- Use when trigger is `field_change`
- Comma-separated
- Example: `status,paymentStatus,slug`

### Condition Rules (`conditionRules`) - textarea JSON
- Use when trigger is `custom_condition`
- Example:
```json
[
  { "field": "type", "operator": "eq", "value": "admin-forget-password" }
]
```

### Subject + Body fields
- `userSubject`, `adminSubject`, `userBody`, `adminBody`
- Supports placeholders:
  - `{{firstName}}`
  - `{{otp}}`
  - `{{status}}`
- Body supports full HTML or plain text

### Mail To (`mailTo`) - dropdown
- `user`, `admin`, `all`

### Attachment Field (`attchment`) - text
- Put model field name containing file id/path/url
- Example: `passfile`

### Attachment Target (`attchmentTo`) - dropdown
- `user`, `admin`, `all`

### Custom Recipients JSON (`mailField`) - textarea JSON
- Optional advanced
- Example:
```json
{
  "user": { "field": "email" },
  "admin": { "field": "email" }
}
```

## 3) Right Side Panel

- Shows direct model fields
- Copy and use as `{{fieldName}}` in subject/body

## 4) If Field Is Empty

- `operation` empty/Any -> any operation
- `mail=Log only` -> no email send
- `watchedFields` empty with `field_change` -> weak/no match
- invalid `conditionRules` -> may fail matching
- admin subject/body empty -> admin mail may skip

## 5) Practical Setup Examples

### A) Same `Otp` table, multiple templates

For forget OTP:
- Model: `Otp`
- Operation: `create`
- Trigger: `custom_condition`
- Condition:
```json
[
  { "field": "type", "operator": "eq", "value": "admin-forget-password" }
]
```

For login OTP:
```json
[
  { "field": "type", "operator": "eq", "value": "login-otp" }
]
```

### B) Blog create mail
- Model: `Blog`
- Operation: `create`
- Trigger: `always`

### C) Blog update status mails
- Model: `Blog`
- Operation: `update`
- Trigger: `custom_condition`
- Make separate rules for `status=1` and `status=0`

### D) Slug changed mail
- Model: `Blog`
- Operation: `update`
- Trigger: `field_change`
- Watched fields: `slug`

## 6) Intern Tips

- Start with specific rules first.
- Keep `*` as fallback only.
- Test in `Log only` before production.
- Use `{{field}}` everywhere.
