import { cacheHandlers } from "../controllers/cache.ts";
import { identifyPayload } from "../module/client.ts";
import { RequestManager } from "../module/requestManager.ts";
import { requestAllMembers } from "../module/shardingManager.ts";
import { Guild } from "../structures/guild.ts";
import { Member } from "../structures/member.ts";
import { structures } from "../structures/mod.ts";
import { Template } from "../structures/template.ts";
import { ImageFormats, ImageSize } from "../types/cdn.ts";
import { ChannelCreatePayload, ChannelTypes } from "../types/channel.ts";
import { Errors } from "../types/errors.ts";
import {
  BannedUser,
  BanOptions,
  ChannelCreateOptions,
  CreateEmojisOptions,
  CreateGuildFromTemplate,
  CreateGuildPayload,
  CreateGuildTemplate,
  CreateRoleOptions,
  CreateServerOptions,
  EditEmojisOptions,
  EditGuildTemplate,
  EditIntegrationOptions,
  FetchMembersOptions,
  GetAuditLogsOptions,
  GuildEditOptions,
  GuildTemplate,
  PositionSwap,
  PruneOptions,
  PrunePayload,
  UpdateGuildPayload,
  UserPayload,
} from "../types/guild.ts";
import { MemberCreatePayload } from "../types/member.ts";
import { Intents } from "../types/options.ts";
import { Permissions } from "../types/permission.ts";
import { RoleData } from "../types/role.ts";
import { formatImageURL } from "../utils/cdn.ts";
import { Collection } from "../utils/collection.ts";
import { endpoints } from "../utils/constants.ts";
import { botHasPermission, calculateBits } from "../utils/permissions.ts";
import { urlToBase64 } from "../utils/utils.ts";

/** Create a new guild. Returns a guild object on success. Fires a Guild Create Gateway event. This endpoint can be used only by bots in less than 10 guilds. */
export function createServer(options: CreateServerOptions) {
  return RequestManager.post(endpoints.GUILDS, options);
}

/** Delete a guild permanently. User must be owner. Returns 204 No Content on success. Fires a Guild Delete Gateway event.
 */
export function deleteServer(guildID: string) {
  return RequestManager.delete(endpoints.GUILD(guildID));
}

/** Gets an array of all the channels ids that are the children of this category. */
export function categoryChildrenIDs(guild: Guild, id: string) {
  return guild.channels.filter((channel) => channel.parentID === id);
}

/** The full URL of the icon from Discords CDN. Undefined when no icon is set. */
export function guildIconURL(
  guild: Guild,
  size: ImageSize = 128,
  format?: ImageFormats,
) {
  return guild.icon
    ? formatImageURL(endpoints.GUILD_ICON(guild.id, guild.icon), size, format)
    : undefined;
}

/** The full URL of the splash from Discords CDN. Undefined if no splash is set. */
export function guildSplashURL(
  guild: Guild,
  size: ImageSize = 128,
  format?: ImageFormats,
) {
  return guild.splash
    ? formatImageURL(
      endpoints.GUILD_SPLASH(guild.id, guild.splash),
      size,
      format,
    )
    : undefined;
}
/** The full URL of the banner from Discords CDN. Undefined if no banner is set. */
export function guildBannerURL(
  guild: Guild,
  size: ImageSize = 128,
  format?: ImageFormats,
) {
  return guild.banner
    ? formatImageURL(
      endpoints.GUILD_BANNER(guild.id, guild.banner),
      size,
      format,
    )
    : undefined;
}

/** Create a channel in your server. Bot needs MANAGE_CHANNEL permissions in the server. */
export async function createGuildChannel(
  guild: Guild,
  name: string,
  options?: ChannelCreateOptions,
) {
  const hasPerm = await botHasPermission(
    guild.id,
    [Permissions.MANAGE_CHANNELS],
  );
  if (!hasPerm) {
    throw new Error(Errors.MISSING_MANAGE_CHANNELS);
  }

  const result =
    (await RequestManager.post(endpoints.GUILD_CHANNELS(guild.id), {
      ...options,
      name,
      permission_overwrites: options?.permission_overwrites?.map((perm) => ({
        ...perm,

        allow: perm.allow.reduce(
          (bits, p) => bits |= BigInt(Permissions[p]),
          BigInt(0),
        ).toString(),
        deny: perm.deny.reduce(
          (bits, p) => bits |= BigInt(Permissions[p]),
          BigInt(0),
        ).toString(),
      })),
      type: options?.type || ChannelTypes.GUILD_TEXT,
    })) as ChannelCreatePayload;

  const channel = await structures.createChannel(result);
  guild.channels.set(result.id, channel);
  return channel;
}

/** Delete a channel in your server. Bot needs MANAGE_CHANNEL permissions in the server. */
export async function deleteChannel(
  guildID: string,
  channelID: string,
  reason?: string,
) {
  const hasPerm = await botHasPermission(
    guildID,
    [Permissions.MANAGE_CHANNELS],
  );
  if (!hasPerm) {
    throw new Error(Errors.MISSING_MANAGE_CHANNELS);
  }

  return RequestManager.delete(endpoints.CHANNEL(channelID), { reason });
}

/** Returns a list of guild channel objects.
*
* ⚠️ **If you need this, you are probably doing something wrong. This is not intended for use. Your channels will be cached in your guild.**
*/
export async function getChannels(guildID: string, addToCache = true) {
  const result = await RequestManager.get(
    endpoints.GUILD_CHANNELS(guildID),
  ) as ChannelCreatePayload[];
  return Promise.all(result.map(async (res) => {
    const channel = await structures.createChannel(res, guildID);
    if (addToCache) {
      cacheHandlers.set("channels", channel.id, channel);
    }
    return channel;
  }));
}

/** Fetches a single channel object from the api.
*
* ⚠️ **If you need this, you are probably doing something wrong. This is not intended for use. Your channels will be cached in your guild.**
*/
export async function getChannel(channelID: string, addToCache = true) {
  const result = await RequestManager.get(
    endpoints.GUILD_CHANNEL(channelID),
  ) as ChannelCreatePayload;
  const channel = await structures.createChannel(result, result.guild_id);
  if (addToCache) cacheHandlers.set("channels", channel.id, channel);
  return channel;
}

/** Modify the positions of channels on the guild. Requires MANAGE_CHANNELS permisison. */
export function swapChannels(
  guildID: string,
  channelPositions: PositionSwap[],
) {
  if (channelPositions.length < 2) {
    throw "You must provide atleast two channels to be swapped.";
  }
  return RequestManager.patch(
    endpoints.GUILD_CHANNELS(guildID),
    channelPositions,
  );
}

/** Returns a guild member object for the specified user.
*
* ⚠️ **ADVANCED USE ONLY: Your members will be cached in your guild most likely. Only use this when you are absolutely sure the member is not cached.**
*/
export async function getMember(
  guildID: string,
  id: string,
  options?: { force?: boolean },
) {
  const guild = await cacheHandlers.get("guilds", guildID);
  if (!guild && !options?.force) return;

  const data = await RequestManager.get(
    endpoints.GUILD_MEMBER(guildID, id),
  ) as MemberCreatePayload;

  const member = await structures.createMember(data, guildID);
  guild?.members.set(id, member);
  return member;
}

/** Returns guild member objects for the specified user by their nickname/username.
*
* ⚠️ **ADVANCED USE ONLY: Your members will be cached in your guild most likely. Only use this when you are absolutely sure the member is not cached.**
*/
export async function getMembersByQuery(
  guildID: string,
  name: string,
  limit = 1,
) {
  const guild = await cacheHandlers.get("guilds", guildID);
  if (!guild) return;

  return new Promise((resolve) => {
    requestAllMembers(guild, resolve, { query: name, limit });
  }) as Promise<Collection<string, Member>>;
}

/** Create an emoji in the server. Emojis and animated emojis have a maximum file size of 256kb. Attempting to upload an emoji larger than this limit will fail and return 400 Bad Request and an error message, but not a JSON status code. If a URL is provided to the image parameter, Discordeno will automatically convert it to a base64 string internally. */
export async function createEmoji(
  guildID: string,
  name: string,
  image: string,
  options: CreateEmojisOptions,
) {
  const hasPerm = await botHasPermission(guildID, [Permissions.MANAGE_EMOJIS]);
  if (!hasPerm) {
    throw new Error(Errors.MISSING_MANAGE_EMOJIS);
  }

  if (image && !image.startsWith("data:image/")) {
    image = await urlToBase64(image);
  }

  return RequestManager.post(endpoints.GUILD_EMOJIS(guildID), {
    ...options,
    name,
    image,
  });
}

/** Modify the given emoji. Requires the MANAGE_EMOJIS permission. */
export async function editEmoji(
  guildID: string,
  id: string,
  options: EditEmojisOptions,
) {
  const hasPerm = await botHasPermission(guildID, [Permissions.MANAGE_EMOJIS]);
  if (!hasPerm) {
    throw new Error(Errors.MISSING_MANAGE_EMOJIS);
  }

  return RequestManager.patch(endpoints.GUILD_EMOJI(guildID, id), {
    name: options.name,
    roles: options.roles,
  });
}

/** Delete the given emoji. Requires the MANAGE_EMOJIS permission. Returns 204 No Content on success. */
export async function deleteEmoji(
  guildID: string,
  id: string,
  reason?: string,
) {
  const hasPerm = await botHasPermission(guildID, [Permissions.MANAGE_EMOJIS]);
  if (!hasPerm) {
    throw new Error(Errors.MISSING_MANAGE_EMOJIS);
  }

  return RequestManager.delete(
    endpoints.GUILD_EMOJI(guildID, id),
    { reason },
  );
}

/** Creates a url to the emoji from the Discord CDN. */
export function emojiURL(id: string, animated = false) {
  return `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "png"}`;
}

/** Create a new role for the guild. Requires the MANAGE_ROLES permission. */
export async function createGuildRole(
  guildID: string,
  options: CreateRoleOptions,
  reason?: string,
) {
  const hasPerm = await botHasPermission(guildID, [Permissions.MANAGE_ROLES]);
  if (!hasPerm) {
    throw new Error(Errors.MISSING_MANAGE_ROLES);
  }

  const result = await RequestManager.post(
    endpoints.GUILD_ROLES(guildID),
    {
      ...options,
      permissions: options.permissions
        ?.reduce((subtotal, perm) => {
          subtotal |= Permissions[perm];
          return subtotal;
        }, 0),
      reason,
    },
  );

  const roleData = result as RoleData;
  const role = await structures.createRole(roleData);
  const guild = await cacheHandlers.get("guilds", guildID);
  guild?.roles.set(role.id, role);
  return role;
}

/** Edit a guild role. Requires the MANAGE_ROLES permission. */
export async function editRole(
  guildID: string,
  id: string,
  options: CreateRoleOptions,
) {
  const hasPerm = await botHasPermission(guildID, [Permissions.MANAGE_ROLES]);
  if (!hasPerm) {
    throw new Error(Errors.MISSING_MANAGE_ROLES);
  }

  return RequestManager.patch(endpoints.GUILD_ROLE(guildID, id), {
    ...options,
    permissions: options.permissions
      ? calculateBits(options.permissions)
      : undefined,
  });
}

/** Delete a guild role. Requires the MANAGE_ROLES permission. */
export async function deleteRole(guildID: string, id: string) {
  const hasPerm = await botHasPermission(guildID, [Permissions.MANAGE_ROLES]);
  if (!hasPerm) {
    throw new Error(Errors.MISSING_MANAGE_ROLES);
  }

  return RequestManager.delete(endpoints.GUILD_ROLE(guildID, id));
}

/** Returns a list of role objects for the guild.
*
* ⚠️ **If you need this, you are probably doing something wrong. This is not intended for use. Your roles will be cached in your guild.**
*/
export async function getRoles(guildID: string) {
  const hasPerm = await botHasPermission(guildID, [Permissions.MANAGE_ROLES]);
  if (!hasPerm) {
    throw new Error(Errors.MISSING_MANAGE_ROLES);
  }

  return RequestManager.get(endpoints.GUILD_ROLES(guildID));
}

/** Modify the positions of a set of role objects for the guild. Requires the MANAGE_ROLES permission. */
export async function swapRoles(guildID: string, rolePositons: PositionSwap) {
  const hasPerm = await botHasPermission(guildID, [Permissions.MANAGE_ROLES]);
  if (!hasPerm) {
    throw new Error(Errors.MISSING_MANAGE_ROLES);
  }

  return RequestManager.patch(endpoints.GUILD_ROLES(guildID), rolePositons);
}

/** Check how many members would be removed from the server in a prune operation. Requires the KICK_MEMBERS permission */
export async function getPruneCount(guildID: string, options: PruneOptions) {
  if (options.days < 1) {
    throw new Error(Errors.PRUNE_MIN_DAYS);
  }

  const hasPerm = await botHasPermission(guildID, [Permissions.KICK_MEMBERS]);
  if (!hasPerm) {
    throw new Error(Errors.MISSING_KICK_MEMBERS);
  }

  const result = await RequestManager.get(
    endpoints.GUILD_PRUNE(guildID),
    { ...options, include_roles: options.roles.join(",") },
  ) as PrunePayload;

  return result.pruned;
}

/** Begin pruning all members in the given time period */
export async function pruneMembers(guildID: string, options: PruneOptions) {
  if (options.days < 1) {
    throw new Error(Errors.PRUNE_MIN_DAYS);
  }

  const hasPerm = await botHasPermission(guildID, [Permissions.KICK_MEMBERS]);
  if (!hasPerm) {
    throw new Error(Errors.MISSING_KICK_MEMBERS);
  }

  RequestManager.post(
    endpoints.GUILD_PRUNE(guildID),
    { ...options, include_roles: options.roles.join(",") },
  );
}

export function fetchMembers(guild: Guild, options?: FetchMembersOptions) {
  if (!(identifyPayload.intents & Intents.GUILD_MEMBERS)) {
    throw new Error(Errors.MISSING_INTENT_GUILD_MEMBERS);
  }

  return new Promise((resolve) => {
    requestAllMembers(guild, resolve, options);
  }) as Promise<Collection<string, Member>>;
}

/** Returns the audit logs for the guild. Requires VIEW AUDIT LOGS permission */
export async function getAuditLogs(
  guildID: string,
  options: GetAuditLogsOptions,
) {
  const hasPerm = await botHasPermission(guildID, [Permissions.VIEW_AUDIT_LOG]);
  if (!hasPerm) {
    throw new Error(Errors.MISSING_VIEW_AUDIT_LOG);
  }

  return RequestManager.get(endpoints.GUILD_AUDIT_LOGS(guildID), {
    ...options,
    limit: options.limit && options.limit >= 1 && options.limit <= 100
      ? options.limit
      : 50,
  });
}

/** Returns the guild embed object. Requires the MANAGE_GUILD permission. */
export async function getEmbed(guildID: string) {
  const hasPerm = await botHasPermission(guildID, [Permissions.MANAGE_GUILD]);
  if (!hasPerm) {
    throw new Error(Errors.MISSING_MANAGE_GUILD);
  }

  return RequestManager.get(endpoints.GUILD_EMBED(guildID));
}

/** Modify a guild embed object for the guild. Requires the MANAGE_GUILD permission. */
export async function editEmbed(
  guildID: string,
  enabled: boolean,
  channelID?: string | null,
) {
  const hasPerm = await botHasPermission(guildID, [Permissions.MANAGE_GUILD]);
  if (!hasPerm) {
    throw new Error(Errors.MISSING_MANAGE_GUILD);
  }

  return RequestManager.patch(
    endpoints.GUILD_EMBED(guildID),
    { enabled, channel_id: channelID },
  );
}

/** Returns the code and uses of the vanity url for this server if it is enabled. Requires the MANAGE_GUILD permission. */
export function getVanityURL(guildID: string) {
  return RequestManager.get(endpoints.GUILD_VANITY_URL(guildID));
}

/** Returns a list of integrations for the guild. Requires the MANAGE_GUILD permission. */
export async function getIntegrations(guildID: string) {
  const hasPerm = await botHasPermission(guildID, [Permissions.MANAGE_GUILD]);
  if (!hasPerm) {
    throw new Error(Errors.MISSING_MANAGE_GUILD);
  }

  return RequestManager.get(endpoints.GUILD_INTEGRATIONS(guildID));
}

/** Modify the behavior and settings of an integration object for the guild. Requires the MANAGE_GUILD permission. */
export async function editIntegration(
  guildID: string,
  id: string,
  options: EditIntegrationOptions,
) {
  const hasPerm = await botHasPermission(guildID, [Permissions.MANAGE_GUILD]);
  if (!hasPerm) {
    throw new Error(Errors.MISSING_MANAGE_GUILD);
  }

  return RequestManager.patch(
    endpoints.GUILD_INTEGRATION(guildID, id),
    options,
  );
}

/** Delete the attached integration object for the guild with this id. Requires MANAGE_GUILD permission. */
export async function deleteIntegration(guildID: string, id: string) {
  const hasPerm = await botHasPermission(guildID, [Permissions.MANAGE_GUILD]);
  if (!hasPerm) {
    throw new Error(Errors.MISSING_MANAGE_GUILD);
  }

  return RequestManager.delete(endpoints.GUILD_INTEGRATION(guildID, id));
}

/** Sync an integration. Requires the MANAGE_GUILD permission. */
export async function syncIntegration(guildID: string, id: string) {
  const hasPerm = await botHasPermission(guildID, [Permissions.MANAGE_GUILD]);
  if (!hasPerm) {
    throw new Error(Errors.MISSING_MANAGE_GUILD);
  }

  return RequestManager.post(endpoints.GUILD_INTEGRATION_SYNC(guildID, id));
}

/** Returns a list of ban objects for the users banned from this guild. Requires the BAN_MEMBERS permission. */
export async function getBans(guildID: string) {
  const hasPerm = await botHasPermission(guildID, [Permissions.BAN_MEMBERS]);
  if (!hasPerm) {
    throw new Error(Errors.MISSING_BAN_MEMBERS);
  }

  const results = await RequestManager.get(
    endpoints.GUILD_BANS(guildID),
  ) as BannedUser[];

  return new Collection<string, BannedUser>(
    results.map((res) => [res.user.id, res]),
  );
}

/** Returns a ban object for the given user or a 404 not found if the ban cannot be found. Requires the BAN_MEMBERS permission. */
export async function getBan(guildID: string, memberID: string) {
  const hasPerm = await botHasPermission(guildID, [Permissions.BAN_MEMBERS]);
  if (!hasPerm) {
    throw new Error(Errors.MISSING_BAN_MEMBERS);
  }

  return RequestManager.get(
    endpoints.GUILD_BAN(guildID, memberID),
  ) as Promise<BannedUser>;
}

/** Ban a user from the guild and optionally delete previous messages sent by the user. Requires the BAN_MEMBERS permission. */
export async function ban(guildID: string, id: string, options: BanOptions) {
  const hasPerm = await botHasPermission(guildID, [Permissions.BAN_MEMBERS]);
  if (!hasPerm) {
    throw new Error(Errors.MISSING_BAN_MEMBERS);
  }

  return RequestManager.put(
    endpoints.GUILD_BAN(guildID, id),
    { ...options, delete_message_days: options.days },
  );
}

/** Remove the ban for a user. REquires BAN_MEMBERS permission */
export async function unban(guildID: string, id: string) {
  const hasPerm = await botHasPermission(guildID, [Permissions.BAN_MEMBERS]);
  if (!hasPerm) {
    throw new Error(Errors.MISSING_BAN_MEMBERS);
  }
  return RequestManager.delete(endpoints.GUILD_BAN(guildID, id));
}

/** Modify a guilds settings. Requires the MANAGE_GUILD permission. */
export async function editGuild(guildID: string, options: GuildEditOptions) {
  const hasPerm = await botHasPermission(guildID, [Permissions.MANAGE_GUILD]);
  if (!hasPerm) {
    throw new Error(Errors.MISSING_MANAGE_GUILD);
  }

  if (options.icon && !options.icon.startsWith("data:image/")) {
    options.icon = await urlToBase64(options.icon);
  }

  if (options.banner && !options.banner.startsWith("data:image/")) {
    options.banner = await urlToBase64(options.banner);
  }

  if (options.splash && !options.splash.startsWith("data:image/")) {
    options.splash = await urlToBase64(options.splash);
  }

  return RequestManager.patch(endpoints.GUILD(guildID), options);
}

/** Get all the invites for this guild. Requires MANAGE_GUILD permission */
export async function getInvites(guildID: string) {
  const hasPerm = await botHasPermission(guildID, [Permissions.MANAGE_GUILD]);
  if (!hasPerm) {
    throw new Error(Errors.MISSING_MANAGE_GUILD);
  }

  return RequestManager.get(endpoints.GUILD_INVITES(guildID));
}

/** Leave a guild */
export function leaveGuild(guildID: string) {
  return RequestManager.delete(endpoints.GUILD_LEAVE(guildID));
}

/** Returns a list of voice region objects for the guild. Unlike the similar /voice route, this returns VIP servers when the guild is VIP-enabled. */
export function getVoiceRegions(guildID: string) {
  return RequestManager.get(endpoints.GUILD_REGIONS(guildID));
}

/** Returns a list of guild webhooks objects. Requires the MANAGE_WEBHOOKs permission. */
export async function getWebhooks(guildID: string) {
  const hasPerm = await botHasPermission(
    guildID,
    [Permissions.MANAGE_WEBHOOKS],
  );
  if (!hasPerm) {
    throw new Error(Errors.MISSING_MANAGE_WEBHOOKS);
  }

  return RequestManager.get(endpoints.GUILD_WEBHOOKS(guildID));
}

/** This function will return the raw user payload in the rare cases you need to fetch a user directly from the API. */
export function getUser(userID: string) {
  return RequestManager.get(endpoints.USER(userID)) as Promise<UserPayload>;
}

/**
 * ⚠️ **If you need this, you are probably doing something wrong. Always use cache.guilds.get()
 *
 * Advanced Devs:
 * This function fetches a guild's data. This is not the same data as a GUILD_CREATE.
 * So it does not cache the guild, you must do it manually.
 * */
export function getGuild(guildID: string, counts = true) {
  return RequestManager.get(
    endpoints.GUILD(guildID),
    { with_counts: counts },
  ) as Promise<UpdateGuildPayload>;
}

/** Returns the guild template if it exists */
export function getGuildTemplate(
  guildID: string,
  templateCode: string,
) {
  return RequestManager.get(
    `${endpoints.GUILD_TEMPLATES(guildID)}/${templateCode}`,
  ) as Promise<Template>;
}

/**
 * Create a new guild based on a template
 * NOTE: This endpoint can be used only by bots in less than 10 guilds.
 */
export async function createGuildFromTemplate(
  templateCode: string,
  data: CreateGuildFromTemplate,
) {
  if (await cacheHandlers.size("guilds") >= 10) {
    throw new Error(
      "This function can only be used by bots in less than 10 guilds.",
    );
  }

  if (data.icon) {
    data.icon = await urlToBase64(data.icon);
  }

  const guild = await RequestManager.post(
    endpoints.GUILD_TEMPLATE(templateCode),
    data,
  ) as Promise<CreateGuildPayload>;
  return guild;
}

/**
 * Returns an array of templates.
 * Requires the `MANAGE_GUILD` permission.
 */
export async function getGuildTemplates(guildID: string) {
  const hasPerm = await botHasPermission(guildID, [Permissions.MANAGE_GUILD]);
  if (!hasPerm) throw new Error(Errors.MISSING_MANAGE_GUILD);

  const templates = await RequestManager.get(
    endpoints.GUILD_TEMPLATES(guildID),
  ) as GuildTemplate[];
  return templates.map((template) => structures.createTemplate(template));
}

/**
 * Deletes a template from a guild.
 * Requires the `MANAGE_GUILD` permission.
 */
export async function deleteGuildTemplate(
  guildID: string,
  templateCode: string,
) {
  const hasPerm = await botHasPermission(guildID, [Permissions.MANAGE_GUILD]);
  if (!hasPerm) throw new Error(Errors.MISSING_MANAGE_GUILD);

  const deletedTemplate = await RequestManager.delete(
    `${endpoints.GUILD_TEMPLATES(guildID)}/${templateCode}`,
  ) as GuildTemplate;
  return structures.createTemplate(deletedTemplate);
}

/**
 * Creates a template for the guild.
 * Requires the `MANAGE_GUILD` permission.
 * @param name name of the template (1-100 characters)
 * @param description description for the template (0-120 characters
 */
export async function createGuildTemplate(
  guildID: string,
  data: CreateGuildTemplate,
) {
  const hasPerm = await botHasPermission(guildID, [Permissions.MANAGE_GUILD]);
  if (!hasPerm) throw new Error(Errors.MISSING_MANAGE_GUILD);

  if (data.name.length < 1 || data.name.length > 100) {
    throw new Error("The name can only be in between 1-100 characters.");
  }

  if (
    data.description?.length &&
    data.description.length > 120
  ) {
    throw new Error("The description can only be in between 0-120 characters.");
  }

  const template = await RequestManager.post(
    endpoints.GUILD_TEMPLATES(guildID),
    data,
  ) as GuildTemplate;
  return structures.createTemplate(template);
}

/**
 * Syncs the template to the guild's current state.
 * Requires the `MANAGE_GUILD` permission.
 */
export async function syncGuildTemplate(guildID: string, templateCode: string) {
  const hasPerm = await botHasPermission(guildID, [Permissions.MANAGE_GUILD]);
  if (!hasPerm) throw new Error(Errors.MISSING_MANAGE_GUILD);

  const template = await RequestManager.put(
    `${endpoints.GUILD_TEMPLATES(guildID)}/${templateCode}`,
  ) as GuildTemplate;
  return structures.createTemplate(template);
}

/**
 * Edit a template's metadata.
 * Requires the `MANAGE_GUILD` permission.
 */
export async function editGuildTemplate(
  guildID: string,
  templateCode: string,
  data: EditGuildTemplate,
) {
  const hasPerm = await botHasPermission(guildID, [Permissions.MANAGE_GUILD]);
  if (!hasPerm) throw new Error(Errors.MISSING_MANAGE_GUILD);

  if (data.name?.length && (data.name.length < 1 || data.name.length > 100)) {
    throw new Error("The name can only be in between 1-100 characters.");
  }

  if (
    data.description?.length &&
    data.description.length > 120
  ) {
    throw new Error("The description can only be in between 0-120 characters.");
  }

  const template = await RequestManager.patch(
    `${endpoints.GUILD_TEMPLATES(guildID)}/${templateCode}`,
    data,
  ) as GuildTemplate;
  return structures.createTemplate(template);
}
