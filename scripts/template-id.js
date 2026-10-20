// The template's placeholder PluginInfo.Id. `npm run init` replaces it with a fresh GUID, so while it is still
// in info.lua the plugin hasn't been initialized, and a build would collide with every other uninitialized one.
export const TemplateId = '00000000-0000-0000-0000-000000000000';

export const isTemplateId = (infoLua) => infoLua.includes(`Id = "${TemplateId}"`);

export const TemplateIdWarning = 'Warning: plugin/info.lua still has the template Id. Run `npm run init` to give this plugin its own Id.';
