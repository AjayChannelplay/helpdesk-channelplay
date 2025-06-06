-- SQL Query to add status column to messages table
ALTER TABLE messages 
ADD COLUMN status VARCHAR(20) DEFAULT 'open';
