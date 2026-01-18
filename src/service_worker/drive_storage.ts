/**
 * Google Drive Storage Module
 * 
 * Handles file operations with Google Drive API (upload, download, delete).
 * Used for syncing user scripts across devices via Google Drive's appDataFolder.
 */

export async function uploadToGoogleDrive({fileId, fileName, fileContent}: {
    fileId?: string,
    fileName?: string;
    fileContent: string,
}): Promise<string> {
    // TODO handle disconnected(removed from account) oauth app
    const accessToken = await chrome.identity.getAuthToken({
        interactive: true,
        scopes: ['https://www.googleapis.com/auth/drive.appdata'],
    });

    if (!fileId) {
        const form = new FormData();
        form.append('metadata', new Blob(
            [JSON.stringify({
                name: fileName,
                mimeType: 'text/plain',
                parents: ['appDataFolder'],
            })],
            {type: 'application/json'},
        ));
        form.append('file', new Blob([fileContent], {type: 'text/plain'}));

        return await fetch(
            'https://www.googleapis.com/upload/drive/v3/files' + (fileId ? `/${fileId}` : '')
            + '?uploadType=multipart&fields=id',
            {
                method: !fileId ? 'POST' : 'PATCH',
                headers: {
                    'Authorization': `Bearer ${accessToken.token}`,
                },
                body: form,
            })
            .then(async (res) => {
                if (!res.ok) {
                    throw new Error(`Failed to upload file ${fileId}: ${res.status} ${res.statusText}`
                        + await res.text());
                }
                return await res.json().then((res) => res.id);
            });
    } else {
        await fetch(
            `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${accessToken.token}`,
                    'Content-Type': 'text/plain',
                    'Content-Length': fileContent.length.toString(),
                },
                body: new Blob([fileContent], {type: 'text/plain'}),
            }
        );
        return fileId;
    }
}

export async function downloadFromGoogleDrive(fileId: string): Promise<string> {
    const accessToken = await chrome.identity.getAuthToken({
        interactive: true,
        scopes: ['https://www.googleapis.com/auth/drive.appdata'],
    });
    return await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken.token}`,
            },
        })
        .then(async (res) => {
            if (!res.ok) {
                throw new Error(`Failed to download file ${fileId}: ${res.status} ${res.statusText}\n`
                    + await res.text());
            }
            return await res.text();
        });
}

export async function deleteFromGoogleDrive(fileId: string): Promise<void> {
    const accessToken = await chrome.identity.getAuthToken({
        interactive: true,
        scopes: ['https://www.googleapis.com/auth/drive.appdata'],
    });
    return await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}`,
        {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken.token}`,
            },
        })
        .then(async (res) => {
            if (!res.ok) {
                throw new Error(`Failed to delete file ${fileId}: ${res.status} ${res.statusText}\n`
                    + await res.text());
            }
        });
}
