import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SnackbarMessage } from 'vuetify/lib/components/VSnackbarQueue/VSnackbarQueue.mjs';
import type { LooseRequired } from '@vue/shared';

export type NotificationType = "success" | "info" | "warning" | "error";
const DEFAULT_TIMEOUT = 5000;

export const useAlertStore = defineStore("alerts", () => {
	const queue = ref<SnackbarMessage[]>([]);

	const add = (message: SnackbarMessage) => {
		queue.value.push(message);
	};

    const addDefault = (text: string, color: NotificationType, timeout: number = DEFAULT_TIMEOUT) => {
		add({ text, color, timeout, timer: 'top' });
    };

	function success(text: string, timeout?: number) {
		add({ text, color: "success", timeout });
	}

	function info(text: string, timeout?: number) {
		add({ text, color: "info", timeout });
	}

	function warning(text: string, timeout?: number) {
		add({ text, color: "warning", timeout });
	}

	function error(text: string, timeout?: number) {
		add({ text, color: "error", timeout });
	}

	function clear() {
		queue.value = [];
	}

	return { queue, add, success, info, warning, error, clear };
});