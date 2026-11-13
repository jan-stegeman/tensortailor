# Security

## Report a problem

Please do not open a public issue for a security problem. Use GitHub's private report instead:
**Security** tab → **Report a vulnerability**. You get an answer as soon as possible; there is no fixed time,
because TensorTailor is a free project.

## What counts

TensorTailor is one HTML file that runs in your browser. Things that matter most:

- text from Hugging Face, LM Studio or a model file that runs as code in the page (cross-site scripting);
- your Hugging Face token leaving the page for anything other than huggingface.co;
- a download that writes outside the folder you chose, overwrites or deletes a file without asking, or puts a
  damaged file in LM Studio's folder;
- the page talking to any other place than huggingface.co (and its download servers) and LM Studio on
  127.0.0.1:1234;
- the GitHub workflows: a way to change a release or the repository without permission.

## Versions

Only the newest release on the [Releases](../../releases) page gets fixes. Its version is at the top left of the
page.
