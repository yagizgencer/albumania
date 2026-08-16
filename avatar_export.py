import psycopg2, os
conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()
cur.execute('SELECT profile_picture_key FROM users WHERE profile_picture_key IS NOT NULL')
with open('avatar_keys.txt', 'w') as f:
    for (key,) in cur.fetchall():
        f.write(key + '\n')
