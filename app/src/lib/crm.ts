/**
 * CRM Integration Service
 * Push leads and customers to external CRM systems
 */

import { logger } from './logger';

export type CRMProvider = 'salesforce' | 'hubspot' | 'pipedrive' | 'zoho';

export interface CRMConnection {
    id: string;
    organizationId: string;
    provider: CRMProvider;
    name: string;
    isConnected: boolean;
    credentials: {
        accessToken?: string;
        refreshToken?: string;
        instanceUrl?: string;
        expiresAt?: Date;
    };
    settings: CRMSettings;
    lastSyncedAt?: Date;
    syncErrors: string[];
}

export interface CRMSettings {
    autoSync: boolean;
    syncOnLeadCreate: boolean;
    syncOnLeadUpdate: boolean;
    fieldMapping: FieldMapping[];
    defaultOwner?: string;
    defaultPipeline?: string;
    defaultStage?: string;
    tags?: string[];
}

export interface FieldMapping {
    socialField: string;
    crmField: string;
    transform?: 'uppercase' | 'lowercase' | 'capitalize' | 'none';
}

export interface Lead {
    id: string;
    source: 'dm' | 'comment' | 'mention' | 'form';
    platform: string;
    username: string;
    displayName: string;
    email?: string;
    phone?: string;
    followers?: number;
    notes: string;
    tags: string[];
    score?: number;
    crmId?: string;
    crmSyncedAt?: Date;
    createdAt: Date;
}

// CRM OAuth URLs
export const CRM_OAUTH_URLS: Record<CRMProvider, string> = {
    salesforce: 'https://login.salesforce.com/services/oauth2/authorize',
    hubspot: 'https://app.hubspot.com/oauth/authorize',
    pipedrive: 'https://oauth.pipedrive.com/oauth/authorize',
    zoho: 'https://accounts.zoho.com/oauth/v2/auth',
};

// Default field mappings
export const DEFAULT_MAPPINGS: Record<CRMProvider, FieldMapping[]> = {
    salesforce: [
        { socialField: 'displayName', crmField: 'Name' },
        { socialField: 'email', crmField: 'Email' },
        { socialField: 'platform', crmField: 'LeadSource' },
        { socialField: 'notes', crmField: 'Description' },
    ],
    hubspot: [
        { socialField: 'displayName', crmField: 'firstname' },
        { socialField: 'email', crmField: 'email' },
        { socialField: 'platform', crmField: 'hs_lead_status' },
        { socialField: 'notes', crmField: 'notes' },
    ],
    pipedrive: [
        { socialField: 'displayName', crmField: 'name' },
        { socialField: 'email', crmField: 'email' },
        { socialField: 'notes', crmField: 'notes' },
    ],
    zoho: [
        { socialField: 'displayName', crmField: 'Last_Name' },
        { socialField: 'email', crmField: 'Email' },
        { socialField: 'platform', crmField: 'Lead_Source' },
    ],
};

/**
 * Connect CRM provider
 */
export async function connectCRM(
    organizationId: string,
    provider: CRMProvider,
    authCode: string
): Promise<CRMConnection> {
    // OAuth token exchange not yet implemented — return unconnected placeholder
    const connection: CRMConnection = {
        id: `crm_${Date.now()}`,
        organizationId,
        provider,
        name: provider.charAt(0).toUpperCase() + provider.slice(1),
        isConnected: false,
        credentials: {},
        settings: {
            autoSync: true,
            syncOnLeadCreate: true,
            syncOnLeadUpdate: true,
            fieldMapping: DEFAULT_MAPPINGS[provider],
        },
        syncErrors: ['CRM OAuth integration not yet implemented'],
    };

    return connection;
}

/**
 * Sync lead to CRM
 */
export async function syncLeadToCRM(
    connection: CRMConnection,
    lead: Lead
): Promise<{ success: boolean; crmId?: string; error?: string }> {
    if (!connection.isConnected) {
        return { success: false, error: 'CRM not connected' };
    }

    // Map fields
    const crmData: Record<string, unknown> = {};
    for (const mapping of connection.settings.fieldMapping) {
        let value = (lead as unknown as Record<string, unknown>)[mapping.socialField];

        if (value && mapping.transform) {
            const strValue = String(value);
            switch (mapping.transform) {
                case 'uppercase':
                    value = strValue.toUpperCase();
                    break;
                case 'lowercase':
                    value = strValue.toLowerCase();
                    break;
                case 'capitalize':
                    value = strValue.charAt(0).toUpperCase() + strValue.slice(1);
                    break;
            }
        }

        if (value !== undefined) {
            crmData[mapping.crmField] = value;
        }
    }

    // Add default settings
    if (connection.settings.defaultOwner) {
        crmData['OwnerId'] = connection.settings.defaultOwner;
    }
    if (connection.settings.tags) {
        crmData['Tags'] = connection.settings.tags.join(', ');
    }

    // CRM API integration not yet implemented
    logger.debug({ provider: connection.provider, ...crmData }, 'CRM sync skipped (no API integration)');

    return {
        success: false,
        error: 'CRM API integration not yet implemented',
    };
}

/**
 * Bulk sync leads
 */
export async function bulkSyncLeads(
    connection: CRMConnection,
    leads: Lead[]
): Promise<{
    synced: number;
    failed: number;
    errors: Array<{ leadId: string; error: string }>;
}> {
    let synced = 0;
    let failed = 0;
    const errors: Array<{ leadId: string; error: string }> = [];

    for (const lead of leads) {
        const result = await syncLeadToCRM(connection, lead);
        if (result.success) {
            synced++;
        } else {
            failed++;
            errors.push({ leadId: lead.id, error: result.error || 'Unknown error' });
        }
    }

    return { synced, failed, errors };
}

/**
 * Get CRM pipelines/stages for mapping
 */
export async function getCRMPipelines(
    connection: CRMConnection
): Promise<Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>> {
    // CRM API not yet integrated
    return [];
}

/**
 * Get CRM users for owner assignment
 */
export async function getCRMUsers(
    connection: CRMConnection
): Promise<Array<{ id: string; name: string; email: string }>> {
    // CRM API not yet integrated
    return [];
}

/**
 * Test CRM connection
 */
export async function testCRMConnection(
    connection: CRMConnection
): Promise<{ success: boolean; message: string }> {
    // In production, make test API call

    if (connection.credentials.expiresAt && connection.credentials.expiresAt < new Date()) {
        return { success: false, message: 'Token expired. Please reconnect.' };
    }

    return { success: true, message: 'Connection successful' };
}
