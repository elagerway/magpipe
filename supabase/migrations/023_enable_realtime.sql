-- Enable realtime for sms_messages and call_records tables
ALTER PUBLICATION supabase_realtime ADD TABLE sms_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE call_records;