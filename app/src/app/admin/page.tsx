/**
 * Super Admin Dashboard
 * Platform overview with key metrics
 */

import { db } from '@/lib/db';
import {
    Users,
    Building2,
    Briefcase,
    FileText,
    TrendingUp,
    Shield,
    CreditCard,
    Ban,
    Sparkles,
} from 'lucide-react';

/**
 * Server component that fetches platform stats directly
 */
async function getStats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
        totalUsers,
        totalOrganizations,
        totalWorkspaces,
        totalPosts,
        totalSocialAccounts,
        usersLast30Days,
        postsLast7Days,
        superAdminCount,
        paidSubscriptions,
        bannedUsers,
    ] = await Promise.all([
        db.user.count(),
        db.organization.count(),
        db.organization.count(),
        db.post.count(),
        db.socialAccount.count(),
        db.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
        db.post.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
        db.user.count({ where: { isSuperAdmin: true } }),
        db.organization.count({ where: { stripeSubscriptionId: { not: null }, subscriptionStatus: 'active' } }),
        db.user.count({ where: { bannedAt: { not: null } } }),
    ]);

    return {
        totalUsers,
        totalOrganizations,
        totalWorkspaces,
        totalPosts,
        totalSocialAccounts,
        usersLast30Days,
        postsLast7Days,
        superAdminCount,
        paidSubscriptions,
        bannedUsers,
    };
}

export default async function AdminDashboard() {
    const stats = await getStats();

    const cards = [
        {
            title: 'Total Users',
            value: stats.totalUsers,
            subtitle: `+${stats.usersLast30Days} last 30 days`,
            icon: Users,
            color: 'blue',
        },
        {
            title: 'Organizations',
            value: stats.totalOrganizations,
            subtitle: 'Enterprise accounts',
            icon: Building2,
            color: 'purple',
        },
        {
            title: 'Workspaces',
            value: stats.totalWorkspaces,
            subtitle: 'Active workspaces',
            icon: Briefcase,
            color: 'green',
        },
        {
            title: 'Total Posts',
            value: stats.totalPosts,
            subtitle: `+${stats.postsLast7Days} this week`,
            icon: FileText,
            color: 'amber',
        },
        {
            title: 'Social Accounts',
            value: stats.totalSocialAccounts,
            subtitle: 'Connected platforms',
            icon: TrendingUp,
            color: 'pink',
        },
        {
            title: 'Super Admins',
            value: stats.superAdminCount,
            subtitle: 'Platform administrators',
            icon: Shield,
            color: 'red',
        },
        {
            title: 'Paid Subscriptions',
            value: stats.paidSubscriptions,
            subtitle: 'Active billing',
            icon: CreditCard,
            color: 'emerald',
        },
        {
            title: 'Banned Users',
            value: stats.bannedUsers,
            subtitle: 'Blocked from login',
            icon: Ban,
            color: 'orange',
        },
    ];

    const colorClasses: Record<string, { bg: string; text: string; border: string }> = {
        blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
        purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
        green: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
        amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
        pink: { bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/30' },
        red: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
        emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
        orange: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
    };

    return (
        <div>
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-white">Platform Overview</h1>
                <p className="text-gray-400 mt-1">
                    Monitor platform health and key metrics
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {cards.map((card) => {
                    const colors = colorClasses[card.color];
                    return (
                        <div
                            key={card.title}
                            className={`rounded-xl border ${colors.border} ${colors.bg} p-6`}
                        >
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-sm text-gray-400">{card.title}</p>
                                    <p className="text-3xl font-bold text-white mt-1">
                                        {card.value.toLocaleString()}
                                    </p>
                                    <p className={`text-sm ${colors.text} mt-2`}>
                                        {card.subtitle}
                                    </p>
                                </div>
                                <div className={`rounded-lg ${colors.bg} p-3`}>
                                    <card.icon className={`h-6 w-6 ${colors.text}`} />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Quick Actions */}
            <div className="mt-10">
                <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <a
                        href="/admin/organizations"
                        className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900 p-4 hover:border-gray-700 transition-colors"
                    >
                        <Building2 className="h-5 w-5 text-purple-400" />
                        <div>
                            <p className="font-medium text-white">Manage Organizations</p>
                            <p className="text-sm text-gray-400">View and edit enterprise accounts</p>
                        </div>
                    </a>
                    <a
                        href="/admin/users"
                        className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900 p-4 hover:border-gray-700 transition-colors"
                    >
                        <Users className="h-5 w-5 text-blue-400" />
                        <div>
                            <p className="font-medium text-white">Manage Users</p>
                            <p className="text-sm text-gray-400">Search and manage user accounts</p>
                        </div>
                    </a>
                    <a
                        href="/admin/settings"
                        className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900 p-4 hover:border-gray-700 transition-colors"
                    >
                        <Shield className="h-5 w-5 text-red-400" />
                        <div>
                            <p className="font-medium text-white">Platform Settings</p>
                            <p className="text-sm text-gray-400">Configure global settings</p>
                        </div>
                    </a>
                    <a
                        href="/admin/billing"
                        className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900 p-4 hover:border-gray-700 transition-colors"
                    >
                        <CreditCard className="h-5 w-5 text-emerald-400" />
                        <div>
                            <p className="font-medium text-white">Billing Management</p>
                            <p className="text-sm text-gray-400">Subscriptions and revenue</p>
                        </div>
                    </a>
                    <a
                        href="/admin/seb-platform-knowledge"
                        className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900 p-4 hover:border-gray-700 transition-colors"
                    >
                        <Sparkles className="h-5 w-5 text-purple-400" />
                        <div>
                            <p className="font-medium text-white">Seb Platform Knowledge</p>
                            <p className="text-sm text-gray-400">Update current platform guidance</p>
                        </div>
                    </a>
                </div>
            </div>
        </div>
    );
}
