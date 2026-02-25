import { db } from './src/lib/db';
import { ensureValidToken } from './src/lib/services/token-service';
import { GRAPH_API_URL } from './src/lib/platform-api/instagram/constants';

async function run() {
    console.log("Starting debug script");

    // Find an active Instagram account
    const accounts = await db.socialAccount.findMany({
        where: { platform: 'INSTAGRAM', isActive: true }
    });

    if (accounts.length === 0) {
        console.log("No active Instagram accounts found.");
        return;
    }

    const account = accounts[0];
    console.log(`Testing account: ${account.name} (${account.platformId})`);

    const tokenResult = await ensureValidToken(account.id);
    if (!tokenResult.success || !tokenResult.accessToken) {
        console.log("Token refresh failed:", tokenResult.error);
        return;
    }

    const accessToken = tokenResult.accessToken;
    const instagramBusinessId = account.platformId;

    const url = `${GRAPH_API_URL}/${instagramBusinessId}?fields=followers_count,follows_count,insights.metric(views,reach,profile_links_taps).period(day)&access_token=${accessToken}`;
    console.log("Fetching URL:", url.replace(accessToken, "HIDDEN_TOKEN"));

    try {
        const response = await fetch(url);
        const data = await response.json();
        console.log("RAW RESPONSE:");
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Fetch threw error:", e);
    }
}

run().catch(console.error).finally(() => process.exit(0));
