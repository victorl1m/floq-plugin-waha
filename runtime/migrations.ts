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
];
