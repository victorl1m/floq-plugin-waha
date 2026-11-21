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
  {
    // Replies (the quoted message travels with the row) and the lid <-> phone pairs that make two addresses one chat.
    id: "003_replies_lids",
    sql: `
      ALTER TABLE {{p}}messages ADD COLUMN reply_to TEXT NOT NULL DEFAULT '';
      ALTER TABLE {{p}}messages ADD COLUMN reply_body TEXT NOT NULL DEFAULT '';
      ALTER TABLE {{p}}messages ADD COLUMN reply_sender TEXT NOT NULL DEFAULT '';
      ALTER TABLE {{p}}messages ADD COLUMN reply_media BOOLEAN NOT NULL DEFAULT FALSE;
      CREATE TABLE {{p}}lid_map (
        user_id TEXT NOT NULL,
        lid TEXT NOT NULL,
        pn TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, lid)
      );
      CREATE INDEX {{p}}lid_map_pn_idx ON {{p}}lid_map (user_id, pn);
      INSERT INTO {{p}}lid_map (user_id, lid, pn) SELECT user_id, chat_id, phone || '@c.us' FROM {{p}}contacts WHERE chat_id LIKE '%@lid' AND phone ~ '^[0-9]{8,15}$';
    `,
  },
  {
    // 3.0.0: message kinds, media, acks, reactions, polls, edits; contact details and avatars; chat state; calls.
    // lid_map now holds every alias of a chat (a lid, or the other spelling of a Brazilian mobile) -> its canonical id.
    id: "004_full_inbox",
    sql: `
      ALTER TABLE {{p}}messages ADD COLUMN stanza TEXT NOT NULL DEFAULT '';
      ALTER TABLE {{p}}messages ADD COLUMN type TEXT NOT NULL DEFAULT 'chat';
      ALTER TABLE {{p}}messages ADD COLUMN media JSONB;
      ALTER TABLE {{p}}messages ADD COLUMN extra JSONB;
      ALTER TABLE {{p}}messages ADD COLUMN ack SMALLINT NOT NULL DEFAULT 0;
      ALTER TABLE {{p}}messages ADD COLUMN edited_at TIMESTAMPTZ;
      ALTER TABLE {{p}}messages ADD COLUMN deleted_at TIMESTAMPTZ;
      ALTER TABLE {{p}}messages ADD COLUMN starred BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE {{p}}messages ADD COLUMN pinned BOOLEAN NOT NULL DEFAULT FALSE;
      UPDATE {{p}}messages SET stanza = CASE WHEN msg_id ~ '^(true|false)_[^_]+_[^_]+' THEN split_part(msg_id, '_', 3) ELSE msg_id END;
      UPDATE {{p}}messages SET ack = 1 WHERE from_me;
      CREATE INDEX {{p}}messages_stanza_idx ON {{p}}messages (user_id, stanza);
      CREATE TABLE {{p}}reactions (
        user_id TEXT NOT NULL, stanza TEXT NOT NULL, sender TEXT NOT NULL, emoji TEXT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, stanza, sender)
      );
      CREATE TABLE {{p}}poll_votes (
        user_id TEXT NOT NULL, stanza TEXT NOT NULL, voter TEXT NOT NULL, options JSONB NOT NULL DEFAULT '[]', at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, stanza, voter)
      );
      CREATE TABLE {{p}}media_blobs (
        user_id TEXT NOT NULL, key TEXT NOT NULL, mime TEXT NOT NULL DEFAULT '', bytes BYTEA NOT NULL, size INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, key)
      );
      CREATE INDEX {{p}}media_blobs_age_idx ON {{p}}media_blobs (user_id, created_at);
      ALTER TABLE {{p}}contacts ADD COLUMN push_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE {{p}}contacts ADD COLUMN about TEXT NOT NULL DEFAULT '';
      ALTER TABLE {{p}}contacts ADD COLUMN picture_at TIMESTAMPTZ;
      ALTER TABLE {{p}}contacts ADD COLUMN has_picture BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE {{p}}contacts ADD COLUMN fetched_at TIMESTAMPTZ;
      ALTER TABLE {{p}}contacts ADD COLUMN blocked BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE {{p}}contacts ADD COLUMN is_business BOOLEAN NOT NULL DEFAULT FALSE;
      UPDATE {{p}}contacts SET push_name = name;
      CREATE TABLE {{p}}known_ids (user_id TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (user_id, id));
      CREATE TABLE {{p}}chat_state (
        user_id TEXT NOT NULL, chat_id TEXT NOT NULL,
        archived BOOLEAN NOT NULL DEFAULT FALSE, pinned BOOLEAN NOT NULL DEFAULT FALSE, muted_until TIMESTAMPTZ, marked_unread BOOLEAN NOT NULL DEFAULT FALSE,
        cleared_at TIMESTAMPTZ, hidden BOOLEAN NOT NULL DEFAULT FALSE, synced_at TIMESTAMPTZ, labels JSONB NOT NULL DEFAULT '[]', updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, chat_id)
      );
      CREATE TABLE {{p}}calls (
        user_id TEXT NOT NULL, call_id TEXT NOT NULL, chat_id TEXT NOT NULL, is_video BOOLEAN NOT NULL DEFAULT FALSE, is_group BOOLEAN NOT NULL DEFAULT FALSE,
        status TEXT NOT NULL DEFAULT 'received', at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, call_id)
      );
      -- Every inbound message came from an id WAHA reported: those ids are real.
      INSERT INTO {{p}}known_ids (user_id, id) SELECT DISTINCT user_id, chat_id FROM {{p}}messages WHERE from_me = FALSE AND chat_id ~ '^[0-9]{8,15}@c[.]us$' ON CONFLICT DO NOTHING;
    `,
  },
  {
    // Statuses (stories) of the last 24 hours; their media lives in media_blobs under "s:<stanza>".
    id: "005_status",
    sql: `
      CREATE TABLE {{p}}statuses (
        user_id TEXT NOT NULL, stanza TEXT NOT NULL, msg_id TEXT NOT NULL, poster TEXT NOT NULL, poster_name TEXT NOT NULL DEFAULT '', mine BOOLEAN NOT NULL DEFAULT FALSE,
        type TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', bg TEXT NOT NULL DEFAULT '', media JSONB, sent_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (user_id, stanza)
      );
      CREATE INDEX {{p}}statuses_at_idx ON {{p}}statuses (user_id, sent_at DESC);
    `,
  },
];
