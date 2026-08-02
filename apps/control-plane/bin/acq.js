#!/usr/bin/env node
// LIVE `acq` CLI — drives the single command facade over the REST surface of a
// running control-plane. Same operations/RBAC as MCP/REST/gRPC (one facade).
//
//   acq <operation> [key=value ...]
//   ACQ_BASE_URL   server base url (default http://localhost:7500)
//   ACQ_TOKEN      bearer token (falls back to CONTROL_ADMIN_TOKEN)
//
// Examples:
//   acq pool.status platform=telegram                 # get
//   acq account.retire accountId=a1                   # set
//   acq browser.providers                             # get
import { runCliHttp } from '../src/cli.js';

const { code, stdout, stderr } = await runCliHttp(process.argv.slice(2));
if (stdout) process.stdout.write(stdout + '\n');
if (stderr) process.stderr.write(stderr + '\n');
process.exit(code);
