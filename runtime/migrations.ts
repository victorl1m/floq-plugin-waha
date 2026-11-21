import type { PluginMigration } from "../shared/sdk";

/** Applied ids never change; append new migrations. `{{p}}` is the table prefix in fallback mode and empty in schema mode (`plugin_waha`). */
export const migrations: PluginMigration[] = [
  {
    id: "001_messages",
    sql: `
      CREATE TABLE {{p}}messages (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        session TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        msg_id TEXT NOT NULL,
        from_me BOOLEAN NOT NULL DEFAULT FALSE,
        sender TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        has_media BOOLEAN NOT NULL DEFAULT FALSE,
        sent_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (session, msg_id)
      );
      CREATE INDEX {{p}}messages_chat_idx ON {{p}}messages (user_id, chat_id, sent_at DESC);
    `,
  },
  {
    id: "002_contacts_reads",
    sql: `
      ALTER TABLE {{p}}messages ADD COLUMN sender_name TEXT NOT NULL DEFAULT '';
      CREATE TABLE {{p}}contacts (
        user_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, chat_id)
      );
      CREATE TABLE {{p}}chat_reads (
        user_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        read_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (user_id, chat_id)
      );
      INSERT INTO {{p}}chat_reads (user_id, chat_id, read_at) SELECT DISTINCT user_id, chat_id, now() FROM {{p}}messages;
    `,
  },
];
