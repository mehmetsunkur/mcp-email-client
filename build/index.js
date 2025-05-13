#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, } from '@modelcontextprotocol/sdk/types.js';
import nodemailer from 'nodemailer';
import Imap from 'node-imap';
import { simpleParser } from 'mailparser';
// Email configuration
const config = {
    auth: {
        user: process.env.EMAIL_USER || "ben.sunkur@piksar.ai",
        pass: process.env.EMAIL_PASS || "Welcome2024!"
    },
    smtp: {
        host: process.env.SMTP_HOST || "mail.piksar.ai",
        port: parseInt(process.env.SMTP_PORT || "25"),
        tls: process.env.SMTP_TLS === 'true'
    },
    imap: {
        host: process.env.IMAP_HOST || "mail.piksar.ai",
        port: parseInt(process.env.IMAP_PORT || "143"),
        tls: process.env.IMAP_TLS === 'true'
    }
};
class EmailServer {
    server;
    transporter;
    imap;
    constructor() {
        this.server = new Server({
            name: 'email',
            version: '0.1.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        // Initialize SMTP transporter
        this.transporter = nodemailer.createTransport({
            host: config.smtp.host,
            port: config.smtp.port,
            secure: config.smtp.tls,
            auth: {
                user: config.auth.user,
                pass: config.auth.pass,
            },
        });
        // Initialize IMAP client
        this.imap = new Imap({
            user: config.auth.user,
            password: config.auth.pass,
            host: config.imap.host,
            port: config.imap.port,
            tls: config.imap.tls,
        });
        this.setupToolHandlers();
        this.server.onerror = (error) => console.error('[MCP Error]', error);
        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });
    }
    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'send_email',
                    description: 'Send an email with optional CC recipients',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            to: {
                                type: 'string',
                                description: 'Recipient email address'
                            },
                            subject: {
                                type: 'string',
                                description: 'Email subject'
                            },
                            text: {
                                type: 'string',
                                description: 'Email body text'
                            },
                            cc: {
                                type: 'array',
                                items: {
                                    type: 'string'
                                },
                                description: 'CC recipients (optional)'
                            }
                        },
                        required: ['to', 'subject', 'text']
                    }
                },
                {
                    name: 'receive_email',
                    description: 'Receive latest emails from inbox',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            limit: {
                                type: 'number',
                                description: 'Number of latest emails to fetch (default: 5)',
                                minimum: 1,
                                maximum: 50
                            }
                        }
                    }
                }
            ]
        }));
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const result = await (async () => {
                switch (request.params.name) {
                    case 'send_email':
                        return await this.handleSendEmail(request.params.arguments);
                    case 'receive_email':
                        return await this.handleReceiveEmail(request.params.arguments);
                    default:
                        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
                }
            })();
            return {
                _meta: {},
                content: result.content
            };
        });
    }
    async handleSendEmail(args) {
        if (!args.to || !args.subject || !args.text) {
            throw new McpError(ErrorCode.InvalidParams, 'Missing required parameters: to, subject, text');
        }
        try {
            const mailOptions = {
                from: config.auth.user,
                to: args.to,
                subject: args.subject,
                text: args.text,
                cc: args.cc
            };
            await this.transporter.sendMail(mailOptions);
            return {
                content: [
                    {
                        type: 'text',
                        text: `Email sent successfully to ${args.to}${args.cc ? ` with CC to ${args.cc.join(', ')}` : ''}`
                    }
                ]
            };
        }
        catch (error) {
            if (error instanceof Error) {
                throw new McpError(ErrorCode.InternalError, `Failed to send email: ${error.message}`);
            }
            throw error;
        }
    }
    async handleReceiveEmail(args) {
        const limit = args?.limit || 5;
        if (limit < 1 || limit > 50) {
            throw new McpError(ErrorCode.InvalidParams, 'Limit must be between 1 and 50');
        }
        return new Promise((resolve, reject) => {
            this.imap.once('ready', () => {
                this.imap.openBox('INBOX', false, async (err, box) => {
                    if (err) {
                        reject(new McpError(ErrorCode.InternalError, `Failed to open inbox: ${err.message}`));
                        return;
                    }
                    const messagePromises = [];
                    // Search for unseen messages
                    this.imap.search(['UNSEEN'], (err, results) => {
                        if (err) {
                            reject(new McpError(ErrorCode.InternalError, `Failed to search messages: ${err.message}`));
                            return;
                        }
                        if (results.length === 0) {
                            this.imap.end();
                            resolve({
                                content: [
                                    {
                                        type: 'text',
                                        text: 'No new messages'
                                    }
                                ]
                            });
                            return;
                        }
                        // Limit the number of messages to fetch
                        const messagesToFetch = results.slice(-limit);
                        const fetch = this.imap.fetch(messagesToFetch, {
                            bodies: '',
                            struct: true,
                            markSeen: true
                        });
                        if (!fetch)
                            return;
                        fetch.on('message', (msg) => {
                            const messagePromise = new Promise((resolveMsg, rejectMsg) => {
                                const chunks = [];
                                msg.on('body', (stream, info) => {
                                    stream.on('data', (chunk) => {
                                        chunks.push(chunk);
                                    });
                                    stream.once('end', async () => {
                                        try {
                                            const buffer = Buffer.concat(chunks);
                                            const parsedEmail = await simpleParser(buffer);
                                            const messageId = parsedEmail.messageId;
                                            const from = parsedEmail.from?.text || '';
                                            const to = Array.isArray(parsedEmail.to) ? parsedEmail.to.map((address) => address.text).join(', ') : parsedEmail.to?.text || '';
                                            const cc = Array.isArray(parsedEmail.cc) ? parsedEmail.cc.map((address) => address.text).join(', ') : parsedEmail.cc?.text || '';
                                            const bcc = Array.isArray(parsedEmail.bcc) ? parsedEmail.bcc.map((address) => address.text).join(', ') : parsedEmail.bcc?.text || '';
                                            const replyTo = parsedEmail.replyTo?.text || '';
                                            const inReplyTo = parsedEmail.inReplyTo || '';
                                            const priority = parsedEmail.priority || '';
                                            const subject = parsedEmail.subject || '';
                                            const body = parsedEmail.text || '';
                                            const date = parsedEmail.date ? parsedEmail.date.toISOString() : '';
                                            resolveMsg({ messageId, subject, date, from, to, cc, bcc, replyTo, inReplyTo, priority, body /**  parsedEmail **/ });
                                        }
                                        catch (error) {
                                            console.error('Error parsing email:', error);
                                            rejectMsg(error);
                                        }
                                    });
                                });
                            });
                            messagePromises.push(messagePromise);
                        });
                        fetch.once('error', (err) => {
                            reject(new McpError(ErrorCode.InternalError, `Failed to fetch messages: ${err.message}`));
                        });
                        fetch.once('end', async () => {
                            try {
                                const messages = await Promise.all(messagePromises);
                                this.imap.end();
                                resolve({
                                    content: [
                                        {
                                            type: 'text',
                                            text: JSON.stringify(messages, null, 2)
                                        }
                                    ]
                                });
                            }
                            catch (error) {
                                reject(new McpError(ErrorCode.InternalError, `Failed to process messages: ${error}`));
                            }
                        });
                    });
                });
            });
            this.imap.once('error', (err) => {
                reject(new McpError(ErrorCode.InternalError, `IMAP error: ${err.message}`));
            });
            this.imap.connect();
        });
    }
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Email MCP server running on stdio');
    }
}
const server = new EmailServer();
server.run().catch(console.error);
