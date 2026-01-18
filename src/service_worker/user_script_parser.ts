/**
 * User Script Parser Module
 * 
 * Parses user script metadata and code according to userscript format standards.
 * Supports metadata blocks as defined by Violentmonkey, Greasemonkey, and Tampermonkey.
 */

export type UserScript = {
    meta: UserScriptMeta;
    code: string;
}

export type UserScriptMeta = {
    name: string;
    namespace?: string;
    version?: string;
    icon?: string;
    description?: string;
    author?: string;
    runAt?: string;
    matches?: string[];
    excludeMatches?: string[];
    requires?: string[];
    noFrames?: boolean;
    world?: string;
}

/**
 * Parse a user script string into metadata and code.
 * 
 * Expects format:
 * // ==UserScript==
 * // @name Example Script
 * // @match *://example.com/*
 * // ==//UserScript==
 * 
 * (function() { ... })();
 * 
 * References:
 * - https://violentmonkey.github.io/api/metadata-block/
 * - https://wiki.greasespot.net/Metadata_Block
 * - https://www.tampermonkey.net/documentation.php
 */
export function parse(userScriptRaw: string): UserScript {
    const userScriptRegexp = /\B\/\/\s*==UserScript==\r?\n(?<metaContent>[\S\s]*?)\r?\n\/\/\s*==\/UserScript==(\S*\r?\n)*(?<code>[\S\s]*)/
    const userScriptMatch = userScriptRaw?.match(userScriptRegexp)
    if (!userScriptMatch?.groups) {
        throw new Error('Invalid userscript format:\n' + userScriptRaw);
    }
    const {metaContent, code} = userScriptMatch.groups;

    const metaTags = {} as Record<string, string[]>;
    metaContent.split('\n')
        .filter((line) => line.trim().startsWith('//'))
        .forEach((line) => {
            const lineMatch = line.trim().match(/@(?<key>[\w-]+)\s+(?<value>.+)/);
            if (!lineMatch?.groups) {
                throw new Error('Invalid userscript meta tag: ' + line);
            }

            const {key, value} = lineMatch.groups;
            metaTags[key] ??= [];
            metaTags[key].push(value);
        });

    if (metaTags.name?.length !== 1) {
        throw new Error('User script must have exactly one @name field.');
    }

    return {
        meta: {
            name: metaTags.name[0],
            namespace: metaTags.namespace?.[0],
            version: metaTags.version?.[0],
            icon: metaTags.icon?.[0],
            description: metaTags.description?.[0],
            author: metaTags.author?.[0],
            runAt: metaTags['run-at']?.[0],
            matches: metaTags.match,
            excludeMatches: metaTags['exclude-match'],
            requires: metaTags.require,
            noFrames: metaTags['no-frames'] ? metaTags['no-frames']?.length >= 0 : undefined,
            world: metaTags.world?.[0],
        },
        code,
    };
}

/**
 * Determine an appropriate icon for a user script.
 * Falls back to favicon service if no icon is specified.
 * 
 * TODO: Consider moving this to frontend
 */
export function determineIcon(userScriptMeta: UserScriptMeta): string | undefined {
    if (userScriptMeta.icon) {
        return userScriptMeta.icon;
    }

    const match = userScriptMeta.matches?.[0];
    if (match) {
        try {
            const matchHost = new URL(match).host;
            return 'https://www.google.com/s2/favicons?sz=64&domain=' + matchHost;
        } catch {
            // ignore
        }
    }
}
