# email-client MCP Server

Email Client MCP Server

This is a TypeScript-based MCP server that implements a simple notes system. It demonstrates core MCP concepts by providing:

- Resources representing text notes with URIs and metadata
- Tools for creating new notes
- Prompts for generating summaries of notes

## Features

### Resources
- List and access notes via `note://` URIs
- Each note has a title, content and metadata
- Plain text mime type for simple content access

### Tools
- `send_email` - Sends an email
  - Takes title and content as required parameters
  - Stores note in server state

- `receive_email` - Receives email
  - Takes title and content as required parameters
  - Stores note in server state

### Prompts
- `summarize_notes` - Generate a summary of all stored notes
  - Includes all note contents as embedded resources
  - Returns structured prompt for LLM summarization

## Development

Install dependencies:
```bash
npm install
```

Build the server:
```bash
npm run build
```

For development with auto-rebuild:
```bash
npm run watch
```

## Installation

To use with Claude Desktop, add the server config:

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "email-client": {
      "env": {
        "EMAIL_USER": "luke.skywalker@piksar.ai",
        "EMAIL_PASS": "Welcome2803!",
        "SMTP_HOST": "mail.piksar.ai",
        "IMAP_HOST": "mail.piksar.ai"
      },
      "command": "/path/to/email-client/build/index.js",
      "alwaysAllow": [
        "send_email",
        "receive_email"
      ]
    }
  }
}
```
### npx usage 

```json
{
  "mcpServers": {
    "email-client": {
      "env": {
        "EMAIL_USER": "luke.skywalker@piksar.ai",
        "EMAIL_PASS": "Welcome2803!",
        "SMTP_HOST": "mail.piksar.ai",
        "IMAP_HOST": "mail.piksar.ai"
      },
      "command": "npx",
      "args": [
        "/path/to/email-client" 
      ],
      "alwaysAllow": [
        "send_email",
        "receive_email"
      ]
    }
  }
}
```

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.
