-- Add attachments_urls column to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments_urls JSONB DEFAULT '[]'::jsonb;

-- Add index for faster JSON queries on attachments
CREATE INDEX IF NOT EXISTS idx_messages_attachments_urls ON messages USING GIN (attachments_urls);

-- Comment: The attachments_urls field will store an array of objects like:
-- [
--   {
--     "name": "file.pdf",
--     "url": "https://your-s3-bucket.amazonaws.com/path/to/file.pdf",
--     "contentType": "application/pdf", 
--     "size": 12345
--   }
-- ]
