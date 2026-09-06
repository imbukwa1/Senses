import os
import uuid

import psycopg

from app.auth import hash_password


USERS = [
    ("Daniel Mwangi", "daniel.mwangi@gmail.com", "Senses@Dan26!"),
    ("Grace Wanjiku", "grace.wanjiku@gmail.com", "Senses@Gra41!"),
    ("Brian Otieno", "brian.otieno@gmail.com", "Senses@Bri73!"),
    ("Faith Achieng", "faith.achieng@gmail.com", "Senses@Fai58!"),
    ("Kevin Kamau", "kevin.kamau@gmail.com", "Senses@Kev92!"),
    ("Sharon Njeri", "sharon.njeri@gmail.com", "Senses@Sha64!"),
    ("Samuel Kiptoo", "samuel.kiptoo@gmail.com", "Senses@Sam37!"),
    ("Cynthia Atieno", "cynthia.atieno@gmail.com", "Senses@Cyn85!"),
    ("Peter Kariuki", "peter.kariuki@gmail.com", "Senses@Pet49!"),
    ("Mercy Chebet", "mercy.chebet@gmail.com", "Senses@Mer71!"),
    ("Joseph Maina", "joseph.maina@gmail.com", "Senses@Jos63!"),
    ("Esther Nyambura", "esther.nyambura@gmail.com", "Senses@Est28!"),
]


database_url = os.getenv("DATABASE_URL")

if not database_url:
    raise RuntimeError("DATABASE_URL is not set. Stop: no database was modified.")

with psycopg.connect(database_url) as conn:
    with conn.cursor() as cur:
        for name, email, password in USERS:

            cur.execute(
                "SELECT id FROM users WHERE lower(email) = lower(%s)",
                (email,),
            )

            if cur.fetchone():
                print(f"SKIPPED: {email} already exists")
                continue

            user_id = uuid.uuid4()

            cur.execute(
                """
                INSERT INTO users (id, name, email)
                VALUES (%s, %s, %s)
                """,
                (user_id, name, email),
            )

            cur.execute(
                """
                INSERT INTO user_credentials (user_id, password_hash)
                VALUES (%s, %s)
                """,
                (user_id, hash_password(password)),
            )

            print(f"CREATED: {name} <{email}>")

    conn.commit()

print("Finished.")