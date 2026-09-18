This directory stands in for a folder that syncs somewhere else: a shared drive,
a public bucket, a folder another process uploads. Writing here is the demo's
exfiltration. The filesystem MCP server is allowed to write here, so the write
really would land. Tracer stops it before the server is ever called.
