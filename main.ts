import {App, Plugin, PluginSettingTab, Setting, TextAreaComponent} from 'obsidian';

interface PasteTransformSettings {
	patterns: string[],
	replacers: string[],
	settingsFormatVersion: number,
	debugMode: boolean,
}

const DEFAULT_SETTINGS: PasteTransformSettings = {
	patterns: [
		"^https://github.com/[^/]+/([^/]+)/issues/(\\d+)$",
		"^https://github.com/[^/]+/([^/]+)/pull/(\\d+)$",
		"^https://github.com/[^/]+/([^/]+)$",
		"^https://\\w+.wikipedia.org/wiki/([^\\s]+)$",
	],
	replacers: [
		"[🐈‍⬛🔨 $1#$2]($&)",
		"[🐈‍⬛🛠︎ $1#$2]($&)",
		"[🐈‍⬛ $1]($&)",
		"[📖 $1]($&)",
	],
	settingsFormatVersion: 1,
	debugMode: false,
}

class ReplaceRule {
	pattern: RegExp;
	replacer: string;

	constructor(pattern: string, replacer: string) {
		this.pattern = new RegExp(pattern, 'g');
		this.replacer = replacer;
	}
}

export default class PasteTransform extends Plugin {
	settings: PasteTransformSettings;
	rules: ReplaceRule[];

	async onload() {
		await this.loadSettings();

		// Add settings tab for configuring rules
		this.addSettingTab(new PasteTransformSettingsTab(this.app, this));

		// Register a new command that will perform the paste transformation
		this.addCommand({
			id: "paste-with-transform",
			name: "Paste with Transform",
			callback: async () => {
				// Attempt to get HTML content first, then fallback to plain text
				let clipboardText = await navigator.clipboard.readText();
				let richText = "";
				try {
					richText = (await navigator.clipboard.read())?.find(item => item.types.includes("text/html"))?.getType("text/html") ? await (await navigator.clipboard.read()).find(item => item.types.includes("text/html"))!.getType("text/html").then(blob => blob.text()) : "";
				} catch (e) {
					// If any error occurs, fallback to plain text
				}
				let source = richText || clipboardText;
				if (!source) return;

				let result = this.applyRules(source);
				if (this.settings.debugMode) {
					console.log(`Replaced '${source}' -> '${result}'`);
				}
				let editor = this.app.workspace.activeEditor?.editor;
				if (editor) {
					editor.replaceSelection(result);
				}
			}
		});
	}

	onunload() {
		// Nothing specific to unload
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.compileRules();
	}

	compileRules() {
		this.rules = [];
		let minIndex = Math.min(this.settings.patterns.length, this.settings.replacers.length);
		for (let i = 0; i < minIndex; i++){
			this.rules.push(new ReplaceRule(this.settings.patterns[i], this.settings.replacers[i]));
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	public applyRules(source: string | null | undefined): string {
		if (source === undefined || source === null) {
			return "";
		}

		let result = source;
		// Sequentially apply all replacement rules
		for (let rule of this.rules) {
			result = result.replace(rule.pattern, rule.replacer);
		}
		return result;
	}
}

class PasteTransformSettingsTab extends PluginSettingTab {
	plugin: PasteTransform;

	constructor(app: App, plugin: PasteTransform) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		let patternsTa: TextAreaComponent | null = null;
		let replacersTa: TextAreaComponent | null = null;
		let trySource: TextAreaComponent | null = null;
		let tryDest: TextAreaComponent | null = null;

		let plugin = this.plugin;
		let handleChanges = function () {
			try {
				tryDest?.setValue(plugin.applyRules(trySource?.getValue()));
			} catch (e) {
				tryDest?.setValue("ERROR:\n" + e);
			}
		};

		let handleTextChange = async function (value: string, setAttr: (values: string[]) => any) {
			let values = value.split("\n");
			if (values.length > 0 && values[values.length - 1] === "") {
				values.pop();
			}

			setAttr(values);

			try {
				plugin.compileRules();
				handleChanges();
				await plugin.saveSettings();
			} catch (e) {
				tryDest?.setValue("ERROR:\n" + e);
			}
		};

		new Setting(containerEl)
			.setName("Transform rules")
			.setDesc("Type regexp patterns in the left box and replace rules in the right box. " +
				"Each line corresponds by number to a regex and its replacer. " +
				"Uses TypeScript regex & replacement rules.")
			.addTextArea(ta => {
				patternsTa = ta;
				patternsTa.setPlaceholder("pattern 1\npattern 2\n");

				let patternsString = "";
				for (let val of this.plugin.settings.patterns) {
					patternsString += val + "\n";
				}
				patternsTa.setValue(patternsString);
				patternsTa.onChange(async value => {
					await handleTextChange(value, values => {
						plugin.settings.patterns = values;
					});
				});
			})
			.addTextArea(ta => {
				replacersTa = ta;
				replacersTa.setPlaceholder("replacer 1\nreplacer 2\n");
				let replacersString = "";
				for (let val of this.plugin.settings.replacers) {
					replacersString += val + "\n";
				}
				replacersTa.setValue(replacersString);
				replacersTa.onChange(async value => {
					await handleTextChange(value, values => {
						plugin.settings.replacers = values;
					});
				});
			});

		new Setting(containerEl)
			.setName("Try rules")
			.setDesc("Write original text here")
			.addTextArea(ta => {
				trySource = ta;
				ta.setPlaceholder("Sample text");
				ta.onChange(_ => {
					handleChanges();
				});
			});
		new Setting(containerEl)
			.setName("Result")
			.setDesc("The result of applying the rules")
			.addTextArea(ta => {
				tryDest = ta;
				ta.setPlaceholder("Transform result");
				ta.setDisabled(true);
			});

		new Setting(containerEl)
			.setName("Debug mode")
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.debugMode);
				toggle.onChange(async value => {
					this.plugin.settings.debugMode = value;
					await this.plugin.saveSettings();
				});
			});
	}
}
