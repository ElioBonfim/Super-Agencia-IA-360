import Link from 'next/link';

export default function Home() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at 30% 20%, rgba(108,92,231,0.15), transparent 50%), radial-gradient(circle at 70% 80%, rgba(167,139,250,0.1), transparent 50%), var(--bg-primary)',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 600, padding: '0 24px' }}>
        <div style={{
          fontSize: 48,
          fontWeight: 800,
          background: 'linear-gradient(135deg, #6c5ce7, #a78bfa, #ddd6fe)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: 16,
          letterSpacing: '-0.03em',
          lineHeight: 1.1,
        }}>
          Super Agência IA 360
        </div>
        <p style={{
          fontSize: 18,
          color: 'var(--text-secondary)',
          marginBottom: 40,
          lineHeight: 1.6,
        }}>
          Crie carrosséis profissionais para Instagram com backgrounds gerados por IA
          e texto sempre nítido e legível.
        </p>
        <Link
          href="/dashboard"
          className="btn btn-primary"
          style={{ fontSize: 16, padding: '14px 36px' }}
        >
          Acessar Dashboard →
        </Link>
      </div>
    </div>
  );
}
