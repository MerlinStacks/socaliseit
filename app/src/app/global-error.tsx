'use client';

/**
 * Global Error Boundary (Root Layout Fallback)
 * Why: Catches errors in the root layout itself. Since the layout crashed,
 * we can't use any layout components — this renders a minimal standalone page
 * with its own <html> and <body> tags.
 */

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html lang="en">
            <body style={{
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                backgroundColor: '#FAFAFA',
                color: '#1A1A1A',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100vh',
                padding: '2rem',
            }}>
                <div style={{ maxWidth: '28rem', width: '100%', textAlign: 'center' }}>
                    <div style={{
                        width: '5rem',
                        height: '5rem',
                        borderRadius: '1rem',
                        backgroundColor: '#FFEBEA',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 1.5rem',
                        fontSize: '2.5rem',
                    }}>
                        ⚠️
                    </div>

                    <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                        Something went wrong
                    </h2>
                    <p style={{ color: '#6B6B6B', marginBottom: '1.5rem' }}>
                        A critical error occurred. Please try refreshing the page.
                    </p>

                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button
                            onClick={reset}
                            style={{
                                padding: '0.625rem 1.25rem',
                                borderRadius: '0.5rem',
                                border: 'none',
                                background: 'linear-gradient(135deg, #D4A574 0%, #E8B4B8 100%)',
                                color: 'white',
                                fontWeight: 500,
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                            }}
                        >
                            Try Again
                        </button>
                        <button
                            onClick={() => window.location.href = '/dashboard'}
                            style={{
                                padding: '0.625rem 1.25rem',
                                borderRadius: '0.5rem',
                                border: '1px solid #E5E5E7',
                                background: 'white',
                                color: '#1A1A1A',
                                fontWeight: 500,
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                            }}
                        >
                            Go Home
                        </button>
                    </div>
                </div>
            </body>
        </html>
    );
}
