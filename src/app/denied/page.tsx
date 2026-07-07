import Link from "next/link";
import styles from "./denied.module.css";

export default function DeniedPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="denied-title">
        <h1 id="denied-title" className={styles.title}>
          Access denied
        </h1>
        <p className={styles.copy}>
          This account is not allowed to continue.
        </p>
        <Link className={styles.link} href="/login">
          Back to login
        </Link>
      </section>
    </main>
  );
}
