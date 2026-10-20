-- Only show debug options when "Show Plugin Debug" is enabled in Designer
if props.plugin_show_debug.Value == false then
  props["Debug Print"].IsHidden = true
end
