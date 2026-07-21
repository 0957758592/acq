# @julio/config

Shared runtime config loader + validator.

## Usage
```js
import { defineSchema, loadConfig, rules } from '@julio/config';

const schema = defineSchema({
  API_URL: rules.requiredString(),
  LOG_LEVEL: rules.optionalString('info')
});

const config = loadConfig(process.env, schema);
```

