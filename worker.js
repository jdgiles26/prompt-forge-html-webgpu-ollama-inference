import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

class WebGPUPipeline {
    static task = 'text-generation';
    static model = 'Qwen/Qwen3.6-0.5B-Instruct'; 
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            this.instance = pipeline(this.task, this.model, {
                device: 'webgpu',
                dtype: 'q8',
                progress_callback,
            });
        }
        return this.instance;
    }
}

self.addEventListener('message', async (event) => {
    const { text, type, maxTokens = 128 } = event.data;
    try {
        if (type === 'generate') {
            const generator = await WebGPUPipeline.getInstance(progressData => {
                self.postMessage({ status: 'progress', data: progressData });
            });
            const output = await generator(text, { max_new_tokens: maxTokens, do_sample: true, temperature: 0.7 });
            self.postMessage({ status: 'complete', result: output });
        }
    } catch (error) {
        self.postMessage({ status: 'error', message: error.message });
    }
});
