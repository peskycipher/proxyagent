# Pod image — llama.cpp on vast.ai (instance 54026402 template)
#
# Matches the image actually running in production:
#   ghcr.io/ggml-org/llama.cpp:full-cuda pinned to the same digest the vast
#   instance pulls, so onstart changes never silently change the CUDA runtime.
#
# vast.ai bakes its own ssh layer ([1/6]..[6/6] in the daemon logs) on top of
# whatever image you deploy; this Dockerfile must therefore remain the *inner*
# image and must not fight vast's sshd config. The onstart script below is the
# vast "docker start" script — it runs after vast's ssh layer and inside the
# started container.
FROM ghcr.io/ggml-org/llama.cpp:full-cuda@sha256:6505ef7cd418bc630026bd40234ea0145b068b9d4e4ab222aa0aa168ffe7ecce

# JSON exec-form ENTRYPOINT: vast's image build warned
# "JSONArgsRecommended: JSON arguments recommended for ENTRYPOINT" — using
# exec form so SIGTERM reaches our process (clean pod stops).
COPY onstart.sh provision-model.sh onstart-ssh-guard.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/onstart.sh /usr/local/bin/provision-model.sh /usr/local/bin/onstart-ssh-guard.sh

ENTRYPOINT ["/usr/local/bin/onstart.sh"]