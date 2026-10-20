-- Q-SYS Plugin
-- Skeleton compiled by the Q-SYS Plugin Compiler into a .qplug.
-- Each #include comment is replaced with the contents of the named file.

-- Information block for the plugin
--[[ #include "info.lua" ]]

-- Define the color of the plugin object in the design
function GetColor(props)
  return { 0, 114, 188 }
end

-- The name that will initially display when dragged into a design
function GetPrettyName(props)
  return "Qsys Plugin Dev Tools v" .. PluginInfo.Version
end

-- Pages within the plugin
PageNames = { "Control" }
function GetPages(props)
  local pages = {}
  --[[ #include "pages.lua" ]]
  return pages
end

-- User configurable properties of the plugin
function GetProperties()
  local props = {}
  --[[ #include "properties.lua" ]]
  return props
end

-- Update available properties when properties are altered by the user
function RectifyProperties(props)
  --[[ #include "rectify_properties.lua" ]]
  return props
end

-- Controls used within the plugin
function GetControls(props)
  local ctrls = {}
  --[[ #include "controls.lua" ]]
  return ctrls
end

-- Layout of controls and graphics for the plugin UI
function GetControlLayout(props)
  local layout = {}
  local graphics = {}
  --[[ #include "layout.lua" ]]
  return layout, graphics
end

-- Start event based logic
if Controls then
  --[[ #include "runtime.lua" ]]
end
